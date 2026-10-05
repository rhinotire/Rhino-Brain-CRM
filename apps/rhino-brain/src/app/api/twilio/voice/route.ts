import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isTwilioConfigured, validateTwilioSignature, toE164 } from "@/lib/twilio";

export const dynamic = "force-dynamic";

const xml = (s: string) => new NextResponse(s, { headers: { "Content-Type": "text/xml" } });
const reject = (msg: string) => xml(`<Response><Say>${msg}</Say><Hangup/></Response>`);

/**
 * TwiML App voice webhook: the browser SDK connects here when a rep dials.
 * From = client:<userId> (set by Twilio from the token identity). Signature-
 * validated — this endpoint is public (middleware exempts /api/twilio/).
 */
export async function POST(request: Request) {
  if (!isTwilioConfigured()) return reject("Phone system is not configured.");

  const form = await request.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => { params[k] = String(v); });

  const url = `${process.env.TWILIO_WEBHOOK_BASE ?? "https://rhino-brain-crm.vercel.app"}/api/twilio/voice`;
  if (!validateTwilioSignature(url, params, request.headers.get("x-twilio-signature"))) {
    return new NextResponse("invalid signature", { status: 403 });
  }

  const to = toE164(String(params.To ?? ""));
  if (!to) return reject("That phone number is not valid.");

  const identity = String(params.From ?? "").replace(/^client:/, "");
  // caller ID follows the rep's company: TWILIO_CALLER_ID_<shortTag> (e.g. _TX
  // for Everflow's Dallas number), falling back to the account-wide default
  let callerId = process.env.TWILIO_CALLER_ID!;
  if (identity) {
    const user = await db.user.findUnique({
      where: { id: identity },
      select: { location: { select: { shortTag: true } } },
    }).catch(() => null);
    const tag = user?.location?.shortTag?.toUpperCase();
    const perCompany = tag ? process.env[`TWILIO_CALLER_ID_${tag}`] : undefined;
    if (perCompany) callerId = perCompany;
  }
  const record = process.env.TWILIO_RECORD === "1" ? ' record="record-from-answer-dual"' : "";
  const statusCb = `${process.env.TWILIO_WEBHOOK_BASE ?? "https://rhino-brain-crm.vercel.app"}/api/twilio/status?u=${encodeURIComponent(identity)}`;

  return xml(
    `<Response><Dial callerId="${callerId}" answerOnBridge="true"${record}>` +
      `<Number statusCallback="${statusCb}" statusCallbackEvent="completed">${to}</Number>` +
    `</Dial></Response>`
  );
}
