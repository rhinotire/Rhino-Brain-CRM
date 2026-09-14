"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignCollectionTask } from "@/actions/collections";
import { draftCollectionEmail } from "@/actions/ai";
import { Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

export function CollectionsActions({ customerId, aiReady }: { customerId: string; aiReady: boolean }) {
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<{ subject: string; body: string; toEmail: string | null } | null>(null);
  const toast = useToast();
  const router = useRouter();

  const assign = () => start(async () => {
    const r = await assignCollectionTask(customerId);
    if (r.ok) { toast(`Collection task assigned to ${r.assignee}`); router.refresh(); }
    else toast(r.error ?? "Failed", "error");
  });

  const doDraft = () => start(async () => {
    const r = await draftCollectionEmail(customerId);
    if (r.ok && r.subject && r.body) setDraft({ subject: r.subject, body: r.body, toEmail: r.toEmail ?? null });
    else toast(r.error ?? "Draft failed", "error");
  });

  const copy = async () => {
    if (!draft) return;
    try { await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`); toast("Copied to clipboard"); }
    catch { toast("Could not copy — select the text manually", "error"); }
  };

  return (
    <>
      <div className="flex gap-1.5">
        <Button size="sm" variant="secondary" onClick={assign} disabled={pending}>📋 Task</Button>
        <Button size="sm" variant="secondary" onClick={doDraft} disabled={pending || !aiReady} title={aiReady ? "" : "AI not configured"}>
          {pending ? "…" : "✉️ Draft"}
        </Button>
      </div>
      {draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setDraft(null)}>
          <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Collection email draft</div>
            <div className="font-semibold text-slate-800">{draft.subject}</div>
            <pre className="mt-3 whitespace-pre-wrap rounded-md bg-slate-50 p-3 font-sans text-sm text-slate-700">{draft.body}</pre>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" onClick={copy}>Copy</Button>
              {draft.toEmail && (
                <a
                  className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  href={`mailto:${draft.toEmail}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`}
                >
                  Open in email app
                </a>
              )}
              <Button size="sm" variant="secondary" onClick={() => setDraft(null)}>Close</Button>
            </div>
            <p className="mt-2 text-xs text-slate-400">Review before sending — the AI drafted this from the A/R data.</p>
          </div>
        </div>
      )}
    </>
  );
}
