import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isTwilioConfigured, validateTwilioSignature } from "@/lib/twilio";

export const dynamic = "force-dynamic";

const last10 = (p: string) => p.replace(/\D/g, "").slice(-10);

/**
 * Call status callback — when a browser call completes, log a CALL activity
 * on the matching customer automatically (duration included). Signature-
 * validated; ?u= carries the rep's userId (set server-side in /voice TwiML).
 */
export async function POST(request: Request) {
  if (!isTwilioConfigured()) return NextResponse.json({ ok: false }, { status: 501 });

  const form = await request.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => { params[k] = String(v); });

  const reqUrl = new URL(request.url);
  const u = reqUrl.searchParams.get("u") ?? "";
  const url = `${process.env.TWILIO_WEBHOOK_BASE ?? "https://rhino-brain-crm.vercel.app"}/api/twilio/status?u=${encodeURIComponent(u)}`;
  if (!validateTwilioSignature(url, params, request.headers.get("x-twilio-signature"))) {
    return new NextResponse("invalid signature", { status: 403 });
  }

  if (params.CallStatus !== "completed") return NextResponse.json({ ok: true });

  const rep = u ? await db.user.findUnique({ where: { id: u }, select: { id: true, locationId: true } }) : null;
  if (!rep) return NextResponse.json({ ok: true });

  const digits = last10(params.To ?? params.Called ?? "");
  // match the customer: the rep's own company first, then anywhere
  const candidates = digits.length === 10
    ? await db.customer.findMany({
        where: { OR: [{ phone: { contains: digits.slice(0, 3) } }, { contactCell: { contains: digits.slice(0, 3) } }] },
        select: { id: true, locationId: true, phone: true, contactCell: true },
        take: 500,
      })
    : [];
  const matches = candidates.filter(c => last10(c.phone ?? "") === digits || last10(c.contactCell ?? "") === digits);
  const customer = matches.find(c => c.locationId === rep.locationId) ?? matches[0] ?? null;

  const secs = Number(params.CallDuration ?? params.DialCallDuration ?? 0) || 0;
  const mins = Math.floor(secs / 60);
  await db.activity.create({
    data: {
      type: "CALL",
      subject: `Browser call ${customer ? "" : `to ${params.To ?? "unknown"} `}(${mins}m ${secs % 60}s)`.trim(),
      notes: "Placed from the CRM browser phone.",
      customerId: customer?.id ?? null,
      repId: rep.id,
      locationId: customer?.locationId ?? rep.locationId ?? null,
      meaningful: secs >= 60, // under a minute is usually voicemail/no-answer
    },
  });
  if (customer) {
    await db.customer.update({ where: { id: customer.id }, data: { lastContactAt: new Date() } }).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
