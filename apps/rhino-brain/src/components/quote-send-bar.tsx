"use client";

import { Button } from "@/components/ui/primitives";

/** Print / Email / WhatsApp actions on the printable quote. Deep links keep the rep in control (no server send). Hidden when printing. */
export function QuoteSendBar({
  email, phone, whatsapp, quoteNumber, total, company, contactName,
}: {
  email?: string | null; phone?: string | null; whatsapp?: string | null;
  quoteNumber: string; total: string; company: string; contactName?: string | null;
}) {
  const waDigits = (whatsapp || phone || "").replace(/\D/g, "");
  const hi = `Hi ${contactName || "there"}`;
  const msg = `${hi}, here's quote ${quoteNumber} from ${company} — total ${total}. Happy to answer any questions. Thank you!`;
  const mailto = email
    ? `mailto:${email}?subject=${encodeURIComponent(`Quote ${quoteNumber} — ${company}`)}&body=${encodeURIComponent(`${msg}\n\n(Quote PDF attached — use “Print / Save PDF” then attach it.)`)}`
    : null;
  const wa = waDigits.length >= 10 ? `https://wa.me/${waDigits}?text=${encodeURIComponent(msg)}` : null;

  return (
    <div className="print:hidden mb-5 flex flex-wrap gap-2">
      <Button variant="primary" onClick={() => window.print()}>🖨 Print / Save PDF</Button>
      {mailto
        ? <a href={mailto} className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50">✉️ Email customer</a>
        : <span className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-400">✉️ No email on file</span>}
      {wa
        ? <a href={wa} target="_blank" rel="noopener" className="inline-flex h-9 items-center rounded-md border border-emerald-300 bg-emerald-50 px-3.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100">💬 WhatsApp</a>
        : <span className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-400">💬 No WhatsApp/phone</span>}
      <a href="/quotes" className="inline-flex h-9 items-center rounded-md px-3.5 text-sm text-slate-500 hover:text-slate-700">← Back to quotes</a>
    </div>
  );
}
