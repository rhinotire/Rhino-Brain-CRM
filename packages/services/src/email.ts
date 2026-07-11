import nodemailer from "nodemailer";

/**
 * Transactional email via Zoho Mail (owner decision #4, 2026-07-11).
 * Env (server-only): ZOHO_SMTP_USER (orlando@rhinotiresusa.com), ZOHO_SMTP_PASS
 * (Zoho app password). Missing env → no-op with a console warning so a mail
 * outage can never lose a lead (in-app notifications always fire too).
 */
const HOST = process.env.ZOHO_SMTP_HOST ?? "smtp.zoho.com";
const USER = process.env.ZOHO_SMTP_USER;
const PASS = process.env.ZOHO_SMTP_PASS;

export function isEmailConfigured(): boolean {
  return Boolean(USER && PASS);
}

export async function sendEmail(to: string, subject: string, text: string): Promise<{ sent: boolean }> {
  if (!USER || !PASS) {
    console.warn(`[email] not configured — skipped "${subject}" to ${to}`);
    return { sent: false };
  }
  const transporter = nodemailer.createTransport({
    host: HOST,
    port: 465,
    secure: true,
    auth: { user: USER, pass: PASS },
  });
  try {
    await transporter.sendMail({ from: USER, to, subject, text });
    return { sent: true };
  } catch (e) {
    console.error("[email] send failed:", e instanceof Error ? e.message : e);
    return { sent: false };
  }
}
