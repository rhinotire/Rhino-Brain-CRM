import nodemailer from "nodemailer";

/**
 * Freight mail transport: dedicated Gmail box via app password (spec §2
 * amendment — same env-based pattern as email.ts/Zoho).
 * Env: FREIGHT_GMAIL_USER (luckywarehouse888@gmail.com), FREIGHT_GMAIL_APP_PASS.
 * Missing env → no-op with a warning so dev environments never send mail.
 */
const USER = process.env.FREIGHT_GMAIL_USER;
const PASS = process.env.FREIGHT_GMAIL_APP_PASS;

export function isFreightMailConfigured(): boolean {
  return Boolean(USER && PASS);
}

export async function sendFreightEmail(to: string[], subject: string, text: string): Promise<{ sent: boolean; error?: string }> {
  if (!USER || !PASS) {
    console.warn(`[freight-mailer] not configured — skipped "${subject}" to ${to.join(", ")}`);
    return { sent: false, error: "mail not configured" };
  }
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: USER, pass: PASS },
  });
  try {
    await transporter.sendMail({ from: `"Rhino Tire USA Logistics" <${USER}>`, to: to.join(", "), subject, text });
    return { sent: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[freight-mailer] send failed:", error);
    return { sent: false, error };
  }
}
