import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isSmsConfigured, sendSms, smsFrom, toE164 } from "@/lib/twilio";
import { fmtMoney } from "@/lib/domain";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Owner's daily brief (老板晨报, owner request 2026-10-20): one SMS every
 * morning (vercel.json cron, 11:30 UTC ≈ 7:30 ET) with yesterday's sales per
 * company, month-to-date, top reps, A/R past due, and fresh AI prospects.
 * Sales figures come from the TireGuru mirror (PosSale, synced every 2h).
 */
/** UTC instant of midnight (ET) for the ET calendar day containing `d`,
 * shifted by dayOffset days / clamped to the 1st when monthStart. Sales rows
 * are stored at ET-midnight, so boundaries must be exact (the first version
 * was off by 4h and dropped Oct 1 from MTD). */
function etMidnightUTC(d: Date, dayOffset: number, firstOfMonth = false): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d); // YYYY-MM-DD
  const [y, m, day] = ymd.split("-").map(Number);
  for (const off of [4, 5]) { // EDT / EST
    const t = Date.UTC(y, m - 1, (firstOfMonth ? 1 : day) + dayOffset, off, 0, 0);
    const hour = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false }).format(new Date(t));
    if (Number(hour) % 24 === 0) return new Date(t); // formats as "0", "00" or "24" depending on runtime
  }
  return new Date(Date.UTC(y, m - 1, (firstOfMonth ? 1 : day) + dayOffset, 5));
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const todayStart = etMidnightUTC(now, 0);
  const yStart = etMidnightUTC(now, -1);
  const monthStart = etMidnightUTC(now, 0, true);

  const locs = await db.location.findMany({ where: { shortTag: { in: ["FL", "TX"] } }, select: { id: true, shortTag: true } });
  const byTag = Object.fromEntries(locs.map(l => [l.shortTag!, l.id]));

  const lines: string[] = [`🦏 ${yStart.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" })} brief`];

  for (const tag of ["FL", "TX"] as const) {
    const locId = byTag[tag];
    if (!locId) continue;
    const [y, mtd] = await Promise.all([
      db.posSale.aggregate({ where: { locationId: locId, date: { gte: yStart, lt: todayStart } }, _sum: { sale: true, gp: true, qty: true } }),
      db.posSale.aggregate({ where: { locationId: locId, date: { gte: monthStart } }, _sum: { sale: true, gp: true } }),
    ]);
    const ySale = Number(y._sum.sale ?? 0), yGp = Number(y._sum.gp ?? 0), yQty = y._sum.qty ?? 0;
    const mSale = Number(mtd._sum.sale ?? 0);
    lines.push(`${tag}: ${fmtMoney(ySale)} (GP ${fmtMoney(yGp)}, ${yQty} units) | MTD ${fmtMoney(mSale)}`);
  }

  // top reps yesterday (both companies)
  const reps = await db.posSale.groupBy({
    by: ["salesperson"],
    where: { date: { gte: yStart, lt: todayStart } },
    _sum: { sale: true },
    orderBy: { _sum: { sale: "desc" } },
    take: 2,
  });
  if (reps.length && Number(reps[0]._sum.sale ?? 0) > 0) {
    const repName = (s: string) =>
      /salesperson,\s*default/i.test(s) ? "TireLink/Default" : s.replace(/\s*\(\w+\)\s*$/, "").split(",")[0].trim();
    lines.push("Top: " + reps.map(r => `${repName(r.salesperson)} ${fmtMoney(Number(r._sum.sale ?? 0))}`).join(", "));
  }

  // A/R past due (write-offs excluded)
  const overdue = await db.invoice.findMany({
    where: {
      balance: { gt: 0 }, dueDate: { lt: now },
      OR: [{ customerId: null }, { customer: { is: { arWriteOffAt: null } } }],
    },
    select: { balance: true },
  });
  lines.push(`A/R past due: ${fmtMoney(overdue.reduce((s, i) => s + Number(i.balance), 0))} (${overdue.length} inv)`);

  // fresh AI prospects (last 24h)
  const prospects = await db.lead.findMany({
    where: { source: "PROSPECTING", createdAt: { gte: new Date(now.getTime() - 24 * 3600000) } },
    select: { pool: true },
  });
  const grade = prospects.filter(p => p.pool === "A_BUYER" || p.pool === "B_PROJECT").length;
  if (prospects.length) lines.push(`New prospects: ${prospects.length} (${grade} A/B-grade) → My Work`);

  const text = lines.join("\n");

  let sent = 0;
  if (isSmsConfigured()) {
    const from = smsFrom("FL") ?? smsFrom(null);
    const phones = (process.env.ORDER_SMS_PHONES ?? "").split(",").map(p => toE164(p.trim())).filter((p): p is string => !!p);
    for (const to of phones) {
      if (from) { await sendSms(to, text, from).then(() => sent++).catch(() => {}); }
    }
  }
  return NextResponse.json({ text, sent });
}
