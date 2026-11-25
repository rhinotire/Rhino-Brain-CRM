"use client";

import { useState, useTransition } from "react";
import { getOpenerDraft } from "@/actions/my-prospects";
import { PhoneDialer } from "@/components/phone-dialer";
import { QuickLogButton } from "@/components/quick-log";
import { ContactChips, type ContactChip } from "@/components/contact-chips";
import { Modal } from "@/components/ui/modal";
import { Button, Badge } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import type { OutreachDraft } from "@rhino/services";

export type BlitzRow = {
  id: string; companyName: string; city: string | null; state: string | null;
  phone: string | null; website: string | null; worked: boolean; contacts: ContactChip[];
};

/**
 * Prospecting "blitz" call list: the rep's assigned near-warehouse prospects,
 * worked top-down — one-tap dial, AI opener, and log-the-call per row. Rows the
 * rep has already touched (stage advanced past NEW_LEAD) show a "done" tick so
 * they can focus on the untouched ones.
 */
export function BlitzList({ rows, phoneEnabled }: { rows: BlitzRow[]; phoneEnabled: boolean }) {
  const [draftFor, setDraftFor] = useState<{ row: BlitzRow; draft: OutreachDraft } | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const toast = useToast();

  const openDraft = (row: BlitzRow) => {
    setLoadingId(row.id);
    startTransition(async () => {
      const r = await getOpenerDraft(row.id);
      setLoadingId(null);
      if (r.ok && r.draft) setDraftFor({ row, draft: r.draft });
      else toast(r.error ?? "Could not load the opener", "error");
    });
  };
  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); toast(`${label} copied ✓`); } catch { /* noop */ }
  };

  if (rows.length === 0) return <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">No prospects in your list right now.</div>;

  return (
    <>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {rows.map(p => (
          <li key={p.id} className={`px-4 py-2.5 ${p.worked ? "bg-slate-50/60" : ""}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="font-medium text-slate-800">{p.companyName}</span>
                {p.worked && <Badge className="ml-2 bg-emerald-100 text-emerald-700">✓ worked</Badge>}
                <div className="text-xs text-slate-500">
                  {[p.city, p.state].filter(Boolean).join(", ")}
                  {p.phone ? ` · ${p.phone}` : " · no phone"}
                  {p.website && <a href={p.website} target="_blank" rel="noopener" className="ml-1 text-brand-700 hover:underline">site ↗</a>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {p.phone && <PhoneDialer phone={p.phone} enabled={phoneEnabled} />}
                <Button size="sm" variant="secondary" onClick={() => openDraft(p)} disabled={loadingId === p.id}>
                  {loadingId === p.id ? "Writing…" : "🧠 Opener"}
                </Button>
                <QuickLogButton leadId={p.id} label="Log Call" variant="primary" size="sm" />
              </div>
            </div>
            {p.contacts.length > 0 && <ContactChips contacts={p.contacts} />}
          </li>
        ))}
      </ul>

      <Modal open={!!draftFor} onClose={() => setDraftFor(null)} title={draftFor ? `Opener — ${draftFor.row.companyName}` : ""}>
        {draftFor && (
          <div className="space-y-3 text-sm">
            <div className="rounded-md border border-sky-200 bg-sky-50 p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-semibold text-sky-900">📞 Phone opener</span>
                <button type="button" className="rounded border border-sky-300 bg-white px-2 py-0.5 text-xs text-sky-700" onClick={() => copy(draftFor.draft.phoneOpener, "Opener")}>📋 copy</button>
              </div>
              <p className="whitespace-pre-wrap text-sky-900">{draftFor.draft.phoneOpener}</p>
            </div>
            {draftFor.draft.talkingPoints.length > 0 && (
              <ul className="list-disc space-y-0.5 pl-5 text-slate-700">
                {draftFor.draft.talkingPoints.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            )}
            <div className="flex justify-end"><Button variant="secondary" onClick={() => setDraftFor(null)}>Close</Button></div>
          </div>
        )}
      </Modal>
    </>
  );
}
