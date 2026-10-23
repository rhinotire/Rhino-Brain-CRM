import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Competitor price watch (owner request 2026-10-20, per-company 2026-10-22).
 * The owner's PC robot holds his dealer logins locally and checks a size
 * watchlist daily — RHINO competitors (TGI/QTD/Tire Dispatch) against
 * FL-stocked sizes, EVERFLOW competitors (Economy/BZO/BHY) against TX-stocked
 * sizes.
 *   GET  ?company=RHINO|EVERFLOW        → { sizes:[{sizeKey,display}] }
 *   GET  ?pending=1&company=…           → { lookups:[{id,sizeKey,display}] }
 *   POST { company, site, rows, lookupDone } → store + resolve lookups
 * Bearer CRON_SECRET.
 */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}
const TAG = (company: string) => (company === "EVERFLOW" ? "TX" : "FL");

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const company = url.searchParams.get("company") === "EVERFLOW" ? "EVERFLOW" : "RHINO";

  if (url.searchParams.get("pending")) {
    const lookups = await db.competitorLookup.findMany({
      where: { status: "PENDING", company },
      orderBy: { createdAt: "asc" },
      take: 5,
      select: { id: true, sizeKey: true, display: true },
    });
    return NextResponse.json({ lookups });
  }

  // watchlist = tire sizes with the most units on hand at THIS company's warehouse
  const products = await db.product.findMany({
    where: {
      active: true,
      category: { in: ["PCR_TIRES", "LT_TIRES", "TBR_TIRES", "TRAILER_TIRES"] },
      sizeSpec: { not: null },
      inventory: { some: { quantity: { gt: 0 }, location: { shortTag: TAG(company) } } },
    },
    select: { sizeSpec: true, inventory: { select: { quantity: true, location: { select: { shortTag: true } } } } },
  });
  const bySize = new Map<string, { display: string; qty: number }>();
  for (const p of products) {
    const display = p.sizeSpec!.trim();
    const sizeKey = display.replace(/-?\s*\d+\s*PR\b/i, "").replace(/\D/g, "");
    if (sizeKey.length < 5) continue;
    const qty = p.inventory.filter(i => i.location?.shortTag === TAG(company)).reduce((s, i) => s + i.quantity, 0);
    if (qty <= 0) continue;
    const cur = bySize.get(sizeKey);
    if (cur) cur.qty += qty; else bySize.set(sizeKey, { display, qty });
  }
  const sizes = [...bySize.entries()].sort((a, b) => b[1].qty - a[1].qty).slice(0, 30).map(([sizeKey, v]) => ({ sizeKey, display: v.display }));
  const searched = await db.competitorLookup.findMany({ where: { company }, distinct: ["sizeKey"], select: { sizeKey: true, display: true } });
  for (const s of searched) if (!sizes.some(x => x.sizeKey === s.sizeKey)) sizes.push({ sizeKey: s.sizeKey, display: s.display });
  return NextResponse.json({ sizes: sizes.slice(0, 60) });
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { company: rawCompany, site, rows, lookupDone } = (await req.json()) as {
    company?: string;
    site: string;
    rows: { sizeKey: string; brand?: string; description: string; partCode?: string; availability?: string; fet?: number; price: number }[];
    lookupDone?: string[];
  };
  const company = rawCompany === "EVERFLOW" ? "EVERFLOW" : "RHINO";
  if (Array.isArray(lookupDone) && lookupDone.length) {
    await db.competitorLookup.updateMany({ where: { id: { in: lookupDone.slice(0, 20) } }, data: { status: "DONE", doneAt: new Date() } });
  }
  if (!site || !Array.isArray(rows)) return NextResponse.json({ error: "site and rows required" }, { status: 400 });
  const clean = rows.filter(r => r.sizeKey && r.description && Number.isFinite(r.price) && r.price > 0).slice(0, 2000);
  const sizeKeys = [...new Set(clean.map(r => r.sizeKey))];
  // snapshot semantics per site+size (site already implies a company)
  await db.competitorPrice.deleteMany({ where: { site, sizeKey: { in: sizeKeys } } });
  for (let i = 0; i < clean.length; i += 500) {
    await db.competitorPrice.createMany({
      data: clean.slice(i, i + 500).map(r => ({
        company,
        site,
        sizeKey: r.sizeKey.slice(0, 20),
        brand: r.brand?.slice(0, 40) ?? null,
        description: r.description.slice(0, 120),
        partCode: r.partCode?.slice(0, 40) ?? null,
        availability: r.availability?.slice(0, 30) ?? null,
        fet: r.fet ?? null,
        price: r.price,
      })),
    });
  }
  return NextResponse.json({ ok: true, stored: clean.length, sizes: sizeKeys.length });
}
