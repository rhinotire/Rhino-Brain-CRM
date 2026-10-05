import { NextResponse } from "next/server";
import { isTwilioConfigured, validateTwilioSignature } from "@/lib/twilio";

export const dynamic = "force-dynamic";

const xml = (s: string) => new NextResponse(s, { headers: { "Content-Type": "text/xml" } });

/**
 * Inbound voice webhook for the Twilio number: customers calling back the
 * CRM's outbound caller ID get forwarded to the front desk instead of dead
 * air. Signature-validated; public route (middleware exempts /api/twilio/).
 */
export async function POST(request: Request) {
  if (!isTwilioConfigured()) return xml(`<Response><Hangup/></Response>`);

  const form = await request.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => { params[k] = String(v); });

  const url = `${process.env.TWILIO_WEBHOOK_BASE ?? "https://rhino-brain-crm.vercel.app"}/api/twilio/inbound`;
  if (!validateTwilioSignature(url, params, request.headers.get("x-twilio-signature"))) {
    return new NextResponse("invalid signature", { status: 403 });
  }

  // forward per called number: Rhino's 689 line → FL front desk, Everflow's
  // 972 line → TX (TWILIO_FORWARD_TO_<tag> overrides; FL default is the
  // Orlando front desk, TX falls back there until Everflow's line is set)
  const NUMBER_TAG: Record<string, string> = { "6892540988": "FL", "9723252288": "TX" };
  const called = String(params.To ?? "").replace(/\D/g, "").slice(-10);
  const tag = NUMBER_TAG[called];
  const forwardTo =
    (tag && process.env[`TWILIO_FORWARD_TO_${tag}`]) ||
    process.env.TWILIO_FORWARD_TO ||
    "+14077775598";
  // no callerId attr: the front desk sees the customer's own number
  return xml(`<Response><Dial answerOnBridge="true">${forwardTo}</Dial></Response>`);
}
