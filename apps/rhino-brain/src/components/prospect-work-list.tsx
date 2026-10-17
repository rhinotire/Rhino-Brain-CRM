"use client";

import { useState, useTransition } from "react";
import { claimProspect, getOpenerDraft, findProspectContacts } from "@/actions/my-prospects";
import { PhoneDialer } from "@/components/phone-dialer";
import { Modal } from "@/components/ui/modal";
import { Button, Badge, EmptyState } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import type { OutreachDraft, ProspectContact } from "@rhino/services";

export type ProspectRow = {
  id: string;
  companyName: string;
  city: string | null;
  state: string | null;
  phone: string | null;
  website: string | null;
  score: number | null;
  productLine: string | null;
  mine: boolean;
  contacts: ProspectContact[];
};

const LINE_LABEL: Record<string, string> = {
  P4_TBR: "Truck tires", P3_PCR: "Passenger tires", P1_TRAILER: "Trailer tires", P2_TRAILER_WHEEL: "Wheels",
};

/** "Today's New Prospects" on My Work: the AI-collected leads near the rep's
 * warehouse, with a one-tap call, an AI opener script, and claim-to-work. */
export function ProspectWorkList({ prospects, phoneEnabled }: { prospects: ProspectRow[]; phoneEnabled: boolean }) {
  const [rows, setRows] = useState(prospects);
  const [draftFor, setDraftFor] = useState<{ row: ProspectRow; draft: OutreachDraft } | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [diggingId, setDiggingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const toast = useToast();

  if (rows.length === 0) return <EmptyState message="No new prospects today — the collector runs every morning." />;

  const openDraft = (row: ProspectRow) => {
    setLoadingId(row.id);
    startTransition(async () => {
      const r = await getOpenerDraft(row.id);
      setLoadingId(null);
      if (r.ok && r.draft) setDraftFor({ row, draft: r.draft });
      else toast(r.error ?? "Could not load the opener", "error");
    });
  };

  const digContacts = (row: ProspectRow) => {
    setDiggingId(row.id);
    startTransition(async () => {
      const r = await findProspectContacts(row.id);
      setDiggingId(null);
      if (r.ok && r.contacts) {
        setRows(rs => rs.map(x => (x.id === row.id ? { ...x, contacts: r.contacts! } : x)));
        toast(`Found ${r.contacts.length} decision-maker${r.contacts.length > 1 ? "s" : ""} ✓`);
      } else toast(r.error ?? "Contact lookup failed", "error");
    });
  };

  const claim = (row: ProspectRow) => {
    startTransition(async () => {
      const r = await claimProspect(row.id);
      if (r.ok) {
        setRows(rs => rs.map(x => (x.id === row.id ? { ...x, mine: true } : x)));
        toast(`${row.companyName} is yours — it's now in "New Leads to Work"`);
      } else toast(r.error ?? "Claim failed", "error");
    });
  };

  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); toast(`${label} copied ✓`); } catch { /* noop */ }
  };

  return (
    <>
      <ul className="divide-y divide-slate-50">
        {rows.map(p => (
          <li key={p.id} className="py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="font-medium text-slate-800">{p.companyName}</span>
                {typeof p.score === "number" && (
                  <Badge className={`ml-2 ${p.score >= 70 ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>AI {p.score}</Badge>
                )}
                {p.mine && <Badge className="ml-1 bg-brand-50 text-brand-700">Yours</Badge>}
                <div className="text-xs text-slate-500">
                  {[p.city, p.state].filter(Boolean).join(", ")}
                  {p.productLine && LINE_LABEL[p.productLine] ? ` · ${LINE_LABEL[p.productLine]}` : ""}
                  {p.phone ? ` · ${p.phone}` : ""}
                  {p.website && (
                    <a href={p.website} target="_blank" rel="noopener" className="ml-1 text-brand-700 hover:underline">site ↗</a>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {p.phone && <PhoneDialer phone={p.phone} enabled={phoneEnabled} />}
                {p.contacts.length === 0 && (
                  <Button size="sm" variant="secondary" onClick={() => digContacts(p)} disabled={diggingId === p.id}>
                    {diggingId === p.id ? "Searching…" : "👤 Find contact"}
                  </Button>
                )}
                <Button size="sm" variant="secondary" onClick={() => openDraft(p)} disabled={loadingId === p.id}>
                  {loadingId === p.id ? "Writing…" : "🧠 Opener"}
                </Button>
                {!p.mine && <Button size="sm" onClick={() => claim(p)}>✓ Claim</Button>}
              </div>
            </div>
            {p.contacts.length > 0 && (
              <div className="mt-1.5 space-y-0.5 rounded-md border border-emerald-200 bg-emerald-50/50 px-2 py-1.5">
                {p.contacts.map((c, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs">
                    <span className="font-semibold text-slate-800">{c.name}</span>
                    <span className="rounded bg-emerald-100 px-1 py-0.5 font-semibold text-emerald-800">{c.title}</span>
                    {c.email && <a href={`mailto:${c.email}`} className="text-slate-700 hover:underline">✉ {c.email}{c.emailStatus === "verified" || c.emailStatus === "valid" ? " ✓" : ""}</a>}
                    {c.phone && (phoneEnabled
                      ? <PhoneDialer phone={c.phone} enabled label={`☎ ${c.phone}`} />
                      : <a href={`tel:${c.phone}`} className="text-slate-700 hover:underline">☎ {c.phone}</a>)}
                    {c.linkedinUrl && (
                      <a href={c.linkedinUrl.startsWith("http") ? c.linkedinUrl : `https://${c.linkedinUrl}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">in↗</a>
                    )}
                  </div>
                ))}
              </div>
            )}
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
            <div className="rounded-md border border-slate-200 p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-semibold text-slate-700">✉️ Email draft</span>
                <button type="button" className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-600"
                  onClick={() => copy(`Subject: ${draftFor.draft.emailSubject}\n\n${draftFor.draft.emailBody}`, "Email")}>📋 copy</button>
              </div>
              <div className="font-medium text-slate-800">{draftFor.draft.emailSubject}</div>
              <p className="mt-1 whitespace-pre-wrap text-slate-600">{draftFor.draft.emailBody}</p>
            </div>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setDraftFor(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
