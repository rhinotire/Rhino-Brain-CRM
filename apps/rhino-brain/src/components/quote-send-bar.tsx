"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/primitives";
import { emailQuote } from "@/actions/quote-email";

/** Print / Email / WhatsApp actions on the printable quote. Hidden when printing. */
export function QuoteSendBar({
  quoteId, emailConfigured, email, phone, whatsapp, quoteNumber, total, company, contactName,
}: {
  quoteId: string; emailConfigured: boolean;
  email?: string | null; phone?: string | null; whatsapp?: string | null;
  quoteNumber: string; total: string; company: string; contactName?: string | null;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const waDigits = (whatsapp || phone || "").replace(/\D/g, "");
  const hi = `Hi ${contactName || "there"}`;
  const msg = `${hi}, here's quote ${quoteNumber} from ${company} — total ${total}. Happy to answer any questions. Thank you!`;
  const mailto = email
    ? `mailto:${email}?subject=${encodeURIComponent(`Quote ${quoteNumber} — ${company}`)}&body=${encodeURIComponent(`${msg}\n\n(Quote PDF attached — use “Print / Save PDF” then attach it.)`)}`
    : null;
  const wa = waDigits.length >= 10 ? `https://wa.me/${waDigits}?text=${encodeURIComponent(msg)}` : null;

  // True one-click send: server generates the PDF and emails it from the company mailbox.
  const canServerSend = emailConfigured && !!email;

  function send() {
    setResult(null);
    start(async () => {
      const r = await emailQuote(quoteId);
      setResult(r.ok ? { ok: true, msg: `✓ Sent to ${email} with PDF attached — logged as an activity.` } : { ok: false, msg: r.error ?? "Send failed." });
    });
  }

  return (
    <div className="print:hidden mb-5 space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => window.print()}>🖨 Print / Save PDF</Button>

        {canServerSend ? (
          <Button variant="primary" onClick={send} disabled={pending}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60">
            {pending ? "Sending…" : "✉️ Email + PDF to customer"}
          </Button>
        ) : mailto ? (
          <a href={mailto} className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50">✉️ Email customer</a>
        ) : (
          <span className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-400">✉️ No email on file</span>
        )}

        {wa
          ? <a href={wa} target="_blank" rel="noopener" className="inline-flex h-9 items-center rounded-md border border-emerald-300 bg-emerald-50 px-3.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100">💬 WhatsApp</a>
          : <span className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-400">💬 No WhatsApp/phone</span>}

        <a href="/quotes" className="inline-flex h-9 items-center rounded-md px-3.5 text-sm text-slate-500 hover:text-slate-700">← Back to quotes</a>
      </div>

      {result && (
        <div className={`rounded-md px-3 py-2 text-sm ${result.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
          {result.msg}
        </div>
      )}
      {canServerSend && !result && (
        <p className="text-xs text-slate-400">Sends from {company}&rsquo;s mailbox with the PDF attached, and logs the email automatically.</p>
      )}
    </div>
  );
}
