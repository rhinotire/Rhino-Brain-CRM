import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isSmsConfigured, sendSms, smsFrom, toE164 } from "@/lib/twilio";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Work queue for the PC order robot (SMS → TireGuru work order).
 * GET  → confirmed orders waiting to be keyed into TireGuru.
 * POST → {id, ok, workOrderNo?|error?}: mark the outcome and text the owner.
 * Bearer CRON_SECRET, same as the other robot endpoints.
 */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const orders = await db.posOrderRequest.findMany({
    where: { status: "CONFIRMED" },
    orderBy: { confirmedAt: "asc" },
    take: 10,
    select: {
      id: true, customerName: true, items: true, notes: true, rawText: true,
      location: { select: { shortTag: true } },
    },
  });
  return NextResponse.json({ orders });
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id, ok, workOrderNo, error } = (await req.json()) as { id: string; ok: boolean; workOrderNo?: string; error?: string };
  const order = await db.posOrderRequest.findUnique({ where: { id }, include: { location: { select: { shortTag: true } } } });
  if (!order || order.status !== "CONFIRMED") return NextResponse.json({ error: "order not found or not confirmed" }, { status: 404 });

  await db.posOrderRequest.update({
    where: { id },
    data: ok
      ? { status: "SUBMITTED", workOrderNo: (workOrderNo ?? "").slice(0, 40) || null, submittedAt: new Date() }
      : { status: "FAILED", error: (error ?? "unknown").slice(0, 400) },
  });

  // log it on the customer so the order shows in their Activity history
  // (Activity requires a rep — attribute the automated entry to an admin)
  const admin = await db.user.findFirst({ where: { role: "ADMIN", active: true }, select: { id: true }, orderBy: { createdAt: "asc" } });
  if (order.customerId && admin) {
    await db.activity.create({
      data: {
        type: "INTERNAL_NOTE",
        subject: ok ? `🛞 SMS order → TireGuru work order #${workOrderNo ?? "?"}` : "⚠️ SMS order FAILED to enter TireGuru",
        notes: `${order.rawText}\n${ok ? "" : `Error: ${error ?? ""}`}`.trim(),
        customerId: order.customerId,
        repId: admin.id,
        locationId: order.locationId,
        meaningful: true,
      },
    }).catch(() => {});
  }

  // text the owner the outcome
  if (isSmsConfigured()) {
    const to = toE164(order.phoneFrom);
    const from = smsFrom(order.location?.shortTag ?? null) ?? smsFrom(null);
    if (to && from) {
      await sendSms(to,
        ok
          ? `✅ TireGuru work order #${workOrderNo} created for ${order.customerName} (draft #${id.slice(-6)}).`
          : `❌ Could not enter the order for ${order.customerName} (draft #${id.slice(-6)}): ${(error ?? "unknown").slice(0, 150)}. Please key it manually.`,
        from
      ).catch(() => {});
    }
  }
  return NextResponse.json({ ok: true });
}
