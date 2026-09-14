"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignCollectionTask, sendCollectionEmail } from "@/actions/collections";
import { draftCollectionEmail } from "@/actions/ai";
import { Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

type Draft = { subject: string; body: string; smsText: string; toEmail: string | null; phone: string | null };

export function CollectionsActions({ customerId, aiReady }: { customerId: string; aiReady: boolean }) {
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [sent, setSent] = useState(false);
  const toast = useToast();
  const router = useRouter();

  const assign = () => start(async () => {
    const r = await assignCollectionTask(customerId);
    if (r.ok) { toast(`Collection task assigned to ${r.assignee}`); router.refresh(); }
    else toast(r.error ?? "Failed", "error");
  });

  const doDraft = () => start(async () => {
    const r = await draftCollectionEmail(customerId);
    if (r.ok && r.subject && r.body) {
      setSent(false);
      setDraft({ subject: r.subject, body: r.body, smsText: r.smsText ?? "", toEmail: r.toEmail ?? null, phone: r.phone ?? null });
    } else toast(r.error ?? "Draft failed", "error");
  });

  const doSend = () => start(async () => {
    if (!draft) return;
    const r = await sendCollectionEmail(customerId, draft.subject, draft.body);
    if (r.ok) { setSent(true); toast(`Email sent to ${draft.toEmail}`); router.refresh(); }
    else toast(r.error ?? "Send failed", "error");
  });

  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); toast(`${label} copied`); }
    catch { toast("Could not copy — select the text manually", "error"); }
  };

  const waDigits = draft?.phone ? draft.phone.replace(/\D/g, "").replace(/^(\d{10})$/, "1$1") : null;

  return (
    <>
      <div className="flex gap-1.5">
        <Button size="sm" variant="secondary" onClick={assign} disabled={pending}>📋 Task</Button>
        <Button size="sm" variant="secondary" onClick={doDraft} disabled={pending || !aiReady} title={aiReady ? "" : "AI not configured"}>
          {pending && !draft ? "…" : "✉️ Draft"}
        </Button>
      </div>
      {draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setDraft(null)}>
          <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Collection email draft {draft.toEmail ? `→ ${draft.toEmail}` : "(no email on file)"}</div>
            <div className="font-semibold text-slate-800">{draft.subject}</div>
            <pre className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-md bg-slate-50 p-3 font-sans text-sm text-slate-700">{draft.body}</pre>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={doSend} disabled={pending || sent || !draft.toEmail}
                title={draft.toEmail ? "" : "No email on the customer record"}>
                {sent ? "✓ Sent" : pending ? "Sending…" : "📤 Send Email Now"}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => copy(`Subject: ${draft.subject}\n\n${draft.body}`, "Email")}>Copy email</Button>
              <Button size="sm" variant="secondary" onClick={() => setDraft(null)}>Close</Button>
            </div>

            {draft.smsText && (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Text message {draft.phone ? `→ ${draft.phone}` : "(no phone on file)"}</div>
                <pre className="whitespace-pre-wrap rounded-md bg-slate-50 p-3 font-sans text-xs text-slate-700">{draft.smsText}</pre>
                <div className="mt-2 flex flex-wrap gap-2">
                  {waDigits && (
                    <a className="inline-flex h-8 items-center rounded-md bg-emerald-600 px-2.5 text-xs font-medium text-white hover:bg-emerald-700"
                      href={`https://wa.me/${waDigits}?text=${encodeURIComponent(draft.smsText)}`} target="_blank" rel="noopener">
                      WhatsApp
                    </a>
                  )}
                  {draft.phone && (
                    <a className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      href={`sms:${draft.phone}?&body=${encodeURIComponent(draft.smsText)}`}>
                      SMS app
                    </a>
                  )}
                  <Button size="sm" variant="secondary" onClick={() => copy(draft.smsText, "Text")}>Copy text</Button>
                </div>
              </div>
            )}
            <p className="mt-2 text-xs text-slate-400">Sent from the company mailbox; replies go to you. Review the numbers before sending.</p>
          </div>
        </div>
      )}
    </>
  );
}
