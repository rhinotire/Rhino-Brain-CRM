import nodemailer from "nodemailer";

/**
 * Transactional email via Zoho Mail (owner decision #4, 2026-07-11).
 *
 * Per-brand sending (keeps Rhino / Everflow / … mailboxes and domains separate):
 *   Base (default brand) — ZOHO_SMTP_USER, ZOHO_SMTP_PASS, [ZOHO_SMTP_FROM], [ZOHO_SMTP_HOST]
 *   Extra brand <KEY>    — ZOHO_SMTP_USER_<KEY>, ZOHO_SMTP_PASS_<KEY>, [ZOHO_SMTP_FROM_<KEY>], [ZOHO_SMTP_HOST_<KEY>]
 *   ZOHO_SMTP_DEFAULT_KEY (default "RHINO") — which brand key owns the base mailbox.
 *
 * <KEY> is the BrandConfig.key ("RHINO", "EVERFLOW", …), uppercased.
 * Strict rule: a non-default brand with NO brand-specific mailbox is treated as
 * "not configured" — it will never fall back to the base mailbox, so an Everflow
 * quote can never be sent from the Rhino address. Missing env → no-op with a
 * console warning so a mail outage can never lose a lead.
 */
// smtppro.zoho.com is required for organization (custom-domain) accounts;
// verified working 2026-07-11 (smtp.zoho.com returns 535 for this org).
const DEFAULT_HOST = process.env.ZOHO_SMTP_HOST ?? "smtppro.zoho.com";
const USER = process.env.ZOHO_SMTP_USER;
const PASS = process.env.ZOHO_SMTP_PASS;
const DEFAULT_KEY = (process.env.ZOHO_SMTP_DEFAULT_KEY ?? "RHINO").toUpperCase();

type Mailbox = { user: string; pass: string; from: string; host: string };

function normKey(key?: string | null): string | null {
  return key ? key.toUpperCase().replace(/[^A-Z0-9]/g, "_") : null;
}

function baseMailbox(): Mailbox | null {
  if (!USER || !PASS) return null;
  return { user: USER, pass: PASS, from: process.env.ZOHO_SMTP_FROM ?? USER, host: DEFAULT_HOST };
}

function brandMailbox(suffix: string): Mailbox | null {
  const user = process.env[`ZOHO_SMTP_USER_${suffix}`];
  const pass = process.env[`ZOHO_SMTP_PASS_${suffix}`];
  if (!user || !pass) return null;
  return {
    user, pass,
    from: process.env[`ZOHO_SMTP_FROM_${suffix}`] ?? user,
    host: process.env[`ZOHO_SMTP_HOST_${suffix}`] ?? DEFAULT_HOST,
  };
}

/** Pick the sending mailbox for a brand key. Never sends a non-default brand from the base mailbox. */
export function resolveMailbox(key?: string | null): Mailbox | null {
  const k = normKey(key);
  if (!k) return baseMailbox();
  const brand = brandMailbox(k);
  if (brand) return brand;
  return k === DEFAULT_KEY ? baseMailbox() : null;
}

/** True when a mailbox exists for this brand (base for the default brand; brand-specific otherwise). */
export function isEmailConfigured(key?: string | null): boolean {
  return resolveMailbox(key) !== null;
}

export type EmailAttachment = { filename: string; content: Buffer; contentType?: string };
export type EmailOptions = { html?: string; attachments?: EmailAttachment[]; replyTo?: string; mailboxKey?: string | null };

export async function sendEmail(to: string, subject: string, text: string, opts?: EmailOptions): Promise<{ sent: boolean }> {
  const mb = resolveMailbox(opts?.mailboxKey);
  if (!mb) {
    console.warn(`[email] not configured for brand "${opts?.mailboxKey ?? "(default)"}" — skipped "${subject}" to ${to}`);
    return { sent: false };
  }
  const transporter = nodemailer.createTransport({
    host: mb.host,
    port: 465,
    secure: true,
    auth: { user: mb.user, pass: mb.pass },
  });
  try {
    await transporter.sendMail({ from: mb.from, to, subject, text, html: opts?.html, attachments: opts?.attachments, replyTo: opts?.replyTo });
    return { sent: true };
  } catch (e) {
    console.error("[email] send failed:", e instanceof Error ? e.message : e);
    return { sent: false };
  }
}
