/**
 * Polls the freight Gmail inbox for unseen mail and routes each message
 * through handleFreightReply. Messages are marked \Seen whether or not they
 * matched (a dedicated box: unmatched mail is just noise). Per-message
 * try/catch — one bad email never stalls the rest (spec §6).
 */
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { handleFreightReply } from "./freight-reply-handler";

export async function pollFreightInbox(
  handle: typeof handleFreightReply = handleFreightReply
): Promise<{ processed: number; matched: number }> {
  const user = process.env.FREIGHT_GMAIL_USER;
  const pass = process.env.FREIGHT_GMAIL_APP_PASS;
  if (!user || !pass) {
    console.warn("[freight-inbox] not configured — poll skipped");
    return { processed: 0, matched: 0 };
  }

  const client = new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: { user, pass }, logger: false });
  let processed = 0;
  let matched = 0;
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const unseen = await client.search({ seen: false });
      for (const uid of unseen ?? []) {
        try {
          const raw = await client.download(String(uid), undefined, { uid: true });
          const parsed = await simpleParser(raw.content);
          const fromEmail = parsed.from?.value?.[0]?.address?.toLowerCase() ?? "";
          const result = await handle({
            subject: parsed.subject ?? "",
            fromEmail,
            text: parsed.text ?? "",
          });
          if (result.handled) matched++;
        } catch (e) {
          console.error(`[freight-inbox] message ${uid} failed:`, e instanceof Error ? e.message : e);
        } finally {
          processed++;
          await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true }).catch(() => {});
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
  return { processed, matched };
}
