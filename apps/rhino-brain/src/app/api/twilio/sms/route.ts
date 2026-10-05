import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isTwilioConfigured, validateTwilioSignature } from "@/lib/twilio";

export const dynamic = "force-dynamic";

const last10 = (p: string) => p.replace(/\D/g, "").slice(-10);
const STOP_RE = /^\s*(stop|stopall|unsubscribe|cancel|end|quit)\s*$/i;
const emptyTwiml = () =>
  new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response/>`, { headers: { "Content-Type": "text/xml" } });

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
