import "server-only";
import twilio from "twilio";

/**
 * Browser phone (Twilio Voice). Env-gated like every integration here —
 * without the vars the UI falls back to plain tel: links.
 *
 * Required env (CRM project):
 *   TWILIO_ACCOUNT_SID   ACxxxx
 *   TWILIO_AUTH_TOKEN    webhook signature validation
 *   TWILIO_API_KEY_SID   SKxxxx   (API key pair mints browser tokens)
 *   TWILIO_API_KEY_SECRET
 *   TWILIO_TWIML_APP_SID APxxxx   (Voice app whose request URL is /api/twilio/voice)
 *   TWILIO_CALLER_ID     +1XXXXXXXXXX (purchased/verified number shown to customers)
 * Optional: TWILIO_RECORD=1 to record calls (two-party-consent states: announce it).
 */

export function isTwilioConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_API_KEY_SID &&
    process.env.TWILIO_API_KEY_SECRET &&
    process.env.TWILIO_TWIML_APP_SID &&
    process.env.TWILIO_CALLER_ID
  );
}

/** Access token for the browser Voice SDK; identity = CRM userId. */
export function mintVoiceToken(identity: string): string {
  const AccessToken = twilio.jwt.AccessToken;
  const token = new AccessToken(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_API_KEY_SID!,
    process.env.TWILIO_API_KEY_SECRET!,
    { identity, ttl: 3600 },
  );
  token.addGrant(new AccessToken.VoiceGrant({
    outgoingApplicationSid: process.env.TWILIO_TWIML_APP_SID!,
    incomingAllow: false, // outbound-only for now; inbound screen-pop is phase 2
  }));
  return token.toJwt();
}

/** Verify X-Twilio-Signature on webhook requests (they carry no session). */
export function validateTwilioSignature(url: string, params: Record<string, string>, signature: string | null): boolean {
  if (!signature || !process.env.TWILIO_AUTH_TOKEN) return false;
  return twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN, signature, url, params);
}

/** "863-513-2221" → "+18635132221"; null when it can't be a US/CA number. */
export function toE164(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return null;
}
