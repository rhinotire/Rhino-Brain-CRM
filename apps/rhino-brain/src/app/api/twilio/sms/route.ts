import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isTwilioConfigured, validateTwilioSignature } from "@/lib/twilio";
import { processOwnerSms, orderSummarySms } from "@/lib/order-bot";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // order parsing calls Claude

const last10 = (p: string) => p.replace(/\D/g, "").slice(-10);
const STOP_RE = /^\s*(stop|stopall|unsubscribe|cancel|end|quit)\s*$/i;
const emptyTwiml = () =>
  new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response/>`, { headers: { "Content-Type": "text/xml" } });
const xmlEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const replyTwiml = (msg: string) =>
  new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${xmlEscape(msg.slice(0, 1500))}</Message></Response>`,
    { headers: { "Content-Type": "text/xml" } });

/** The owner's phone(s) allowed to place TireGuru work orders by text —
 * ORDER_SMS_PHONES env, comma-separated, matched on last 10 digits. */
const orderPhones = () => (process.env.ORDER_SMS_PHONES ?? "").split(",").map(last10).filter(p => p.length === 10);

async function handleOrderBot(digits: string, body: string): Promise<NextResponse> {
  // confirm / cancel the newest pending draft
  if (/^\s*[10]\s*$/.test(body)) {
    const pending = await db.posOrderRequest.findFirst({
      where: { phoneFrom: digits, status: "PENDING_CONFIRM" },
      orderBy: { createdAt: "desc" },
    });
    if (!pending) return replyTwiml("No pending order draft. Text a new order to start.");
    if (body.trim() === "0") {
      await db.posOrderRequest.update({ where: { id: pending.id }, data: { status: "CANCELLED" } });
      return replyTwiml(`Cancelled draft #${pending.id.slice(-6)}.`);
    }
    const items = pending.items as { matched?: boolean }[];
    if (!pending.customerId || items.some(i => !i.matched)) {
      return replyTwiml("⚠️ Can't submit: customer or an item had no match. Text the order again with more detail (or handle it in TireGuru).");
    }
    await db.posOrderRequest.update({ where: { id: pending.id }, data: { status: "CONFIRMED", confirmedAt: new Date() } });
    return replyTwiml(`✅ Confirmed #${pending.id.slice(-6)} — the robot will key it into TireGuru within ~5 minutes and text you the work-order number.`);
  }

  // anything else from the owner's phone: price/stock/AR query or a new order.
  // The last 2h of turns give follow-ups ("其他便宜的") their context.
  try {
    const recent = await db.ownerSmsLog.findMany({
      where: { phoneFrom: digits, createdAt: { gte: new Date(Date.now() - 2 * 3600000) } },
      orderBy: { createdAt: "desc" },
      take: 8,
    });
    const history = recent.reverse().map(r => ({ role: (r.direction === "IN" ? "user" : "assistant") as "user" | "assistant", content: r.body.slice(0, 500) }));
    const logTurn = async (direction: "IN" | "OUT", text: string) => {
      await db.ownerSmsLog.create({ data: { phoneFrom: digits, direction, body: text.slice(0, 1200) } }).catch(() => {});
    };
    await logTurn("IN", body);

    const result = await processOwnerSms(body, history);
    if (result.kind === "reply") {
      await logTurn("OUT", result.text);
      return replyTwiml(result.text);
    }

    const parsed = result.order;
    if (!parsed.ok) return replyTwiml(`⚠️ Couldn't read that as an order (${parsed.error}). Say customer + items + quantities, e.g. "BUDS AUTO, 8x ST235/80R16 Rhino ST".`);
    // supersede any older unconfirmed draft so "1" always means the newest one
    await db.posOrderRequest.updateMany({ where: { phoneFrom: digits, status: "PENDING_CONFIRM" }, data: { status: "CANCELLED" } });
    const req = await db.posOrderRequest.create({
      data: {
        phoneFrom: digits,
        rawText: body,
        customerId: parsed.customerId,
        customerName: parsed.customerName,
        locationId: parsed.locationId,
        items: parsed.items as object[],
        total: parsed.total,
        notes: parsed.notes,
      },
    });
    const summary = orderSummarySms(parsed, req.id);
    await db.ownerSmsLog.create({ data: { phoneFrom: digits, direction: "OUT", body: summary.slice(0, 1200) } }).catch(() => {});
    return replyTwiml(summary);
  } catch (e) {
    return replyTwiml(`⚠️ Bot error: ${e instanceof Error ? e.message.slice(0, 200) : "unknown"}`);
  }
}

/**
 * Inbound SMS webhook: log the reply on the matching customer and ping the
 * assigned rep's notification bell. Signature-validated public route.
 */
export async function POST(request: Request) {
  if (!isTwilioConfigured()) return emptyTwiml();

  const form = await request.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => { params[k] = String(v); });

  const url = `${process.env.TWILIO_WEBHOOK_BASE ?? "https://rhino-brain-crm.vercel.app"}/api/twilio/sms`;
  if (!validateTwilioSignature(url, params, request.headers.get("x-twilio-signature"))) {
    return new NextResponse("invalid signature", { status: 403 });
  }

  const from = params.From ?? "";
  const body = (params.Body ?? "").trim().slice(0, 1000);
  const digits = last10(from);
  if (digits.length !== 10 || !body) return emptyTwiml();

  // owner's phone → SMS order bot, never the customer-reply path
  if (orderPhones().includes(digits)) return handleOrderBot(digits, body);

  // same matching strategy as the call-status webhook
  const candidates = await db.customer.findMany({
    where: { OR: [{ phone: { contains: digits.slice(0, 3) } }, { contactCell: { contains: digits.slice(0, 3) } }] },
    select: { id: true, companyName: true, locationId: true, phone: true, contactCell: true, assignedRepId: true },
    take: 500,
  });
  const matches = candidates.filter(c => last10(c.phone ?? "") === digits || last10(c.contactCell ?? "") === digits);
  const customer = matches[0] ?? null;

  const optedOut = STOP_RE.test(body);
  const admin = await db.user.findFirst({ where: { role: "ADMIN", active: true }, select: { id: true } });

  if (customer) {
    const repId = customer.assignedRepId ?? admin?.id;
    if (repId) {
      await db.activity.create({
        data: {
          type: "TEXT",
          subject: optedOut ? "Text reply: STOP (opted out of texting)" : "Text reply received",
          notes: `📨 Inbound from ${from}: ${body}`,
          customerId: customer.id,
          repId,
          locationId: customer.locationId,
          meaningful: !optedOut,
        },
      });
    }
    // bell the assigned rep (or an admin when unassigned)
    const notifyId = customer.assignedRepId ?? admin?.id;
    if (notifyId) {
      await db.notification.create({
        data: {
          type: "CUSTOMER_NEEDS_CONTACT",
          title: optedOut ? `🚫 ${customer.companyName} texted STOP — do not text them` : `📨 Text reply from ${customer.companyName}`,
          body: body.slice(0, 140),
          link: `/customers/${customer.id}`,
          userId: notifyId,
        },
      }).catch(() => {});
    }
  } else if (admin) {
    // unknown number — surface it to an admin so the reply isn't lost
    await db.notification.create({
      data: {
        type: "CUSTOMER_NEEDS_CONTACT",
        title: `📨 Text from unknown number ${from}`,
        body: body.slice(0, 140),
        userId: admin.id,
      },
    }).catch(() => {});
  }

  return emptyTwiml();
}
