"use client";

import { useState, useTransition } from "react";
import { calibrateLead, generateOutreachDraft, findContacts } from "@/actions/prospecting";

type Check = { check: string; pass: boolean; evidence: string };
type Draft = { emailSubject: string; emailBody: string; phoneOpener: string; talkingPoints: string[]; generatedAt: string };
type Contact = { name: string; title: string; email: string | null; emailStatus: string | null; phone: string | null; linkedinUrl: string | null; source: string };
type Props = {
  lead: {
    id: string; companyName: string; city: string | null; state: string | null;
    pool: string | null; confidence: string | null; productLine: string | null; score: number | null;
    email: string | null; phone: string | null;
    scoreReasons: Check[] | null;
    enrichment: { businessSummary?: string; brandsSold?: string[]; buyerSignals?: string[]; emails?: string[] } | null;
    meta: { website?: string; angle?: string; outreachDraft?: Draft; contacts?: Contact[] } | null;
  };
  reps: Array<{ id: string; name: string }>;
};

const POOL_COLORS: Record<string, string> = {
  A_BUYER: "bg-emerald-100 text-emerald-800",
  B_PROJECT: "bg-blue-100 text-blue-800",
  C_CHANNEL: "bg-amber-100 text-amber-800",
  D_EXCLUDED: "bg-slate-200 text-slate-600",
};

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50"
    >
      {copied ? "✓ Copied" : label}
    </button>
  );
}

export function ProspectCard({ lead, reps }: Props) {
  const [pending, start] = useTransition();
  const [drafting, startDraft] = useTransition();
  const [repId, setRepId] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [alsoExclude, setAlsoExclude] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(lead.meta?.outreachDraft ?? null);
  const [showDraft, setShowDraft] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>(lead.meta?.contacts ?? []);
  const [findingContacts, startFind] = useTransition();

  const lookupContacts = () =>
    startFind(async () => {
      setError("");
      const r = await findContacts(lead.id);
      if (!r.ok || !r.contacts) setError(r.error ?? "contact lookup failed");
      else setContacts(r.contacts);
    });

  const act = (verdict: "FOLLOW" | "REJECT") =>
    start(async () => {
      const r = await calibrateLead(lead.id, verdict, { repId: repId || undefined, reason, alsoExclude });
      if (!r.ok) setError(r.error ?? "failed");
      else setDone(true);
    });

  const makeDraft = () =>
    startDraft(async () => {
      setError("");
      const r = await generateOutreachDraft(lead.id);
      if (!r.ok || !r.draft) setError(r.error ?? "draft failed");
      else { setDraft(r.draft); setShowDraft(true); }
    });

  if (done) return null;

  const contactEmails = [...new Set([lead.email, ...(lead.enrichment?.emails ?? [])].filter((e): e is string => !!e))];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${POOL_COLORS[lead.pool ?? ""] ?? "bg-slate-100"}`}>
          {lead.pool ?? "?"}/{lead.confidence ?? "?"}
        </span>
        <span className="text-xs font-semibold text-slate-500">{lead.productLine ?? "—"}</span>
        <span className="text-xs text-slate-400">score {lead.score ?? "—"}</span>
        <h3 className="w-full text-base font-bold">
          {lead.companyName}
          <span className="ml-2 text-sm font-normal text-slate-400">{[lead.city, lead.state].filter(Boolean).join(", ")}</span>
        </h3>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {lead.meta?.website && (
          <a href={lead.meta.website.startsWith("http") ? lead.meta.website : `https://${lead.meta.website}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
            🌐 {lead.meta.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
          </a>
        )}
        {lead.phone && (
          <a href={`tel:${lead.phone}`} className="font-semibold text-slate-700 hover:underline">☎ {lead.phone}</a>
        )}
        {contactEmails.map((e) => (
          <a key={e} href={`mailto:${e}`} className="text-slate-700 hover:underline">✉ {e}</a>
        ))}
        {!lead.phone && contactEmails.length === 0 && contacts.length === 0 && (
          <span className="text-xs text-slate-400">No direct contact found yet — try “Find contacts”</span>
        )}
      </div>

      {contacts.length > 0 && (
        <div className="space-y-1 rounded-lg border border-emerald-200 bg-emerald-50/50 p-2">
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Decision makers</p>
          {contacts.map((c, i) => (
            <div key={i} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm">
              <span className="font-semibold text-slate-800">{c.name}</span>
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-800">{c.title}</span>
              {c.email && (
                <a href={`mailto:${c.email}`} className="text-slate-700 hover:underline">
                  ✉ {c.email}{c.emailStatus === "verified" || c.emailStatus === "valid" ? " ✓" : ""}
                </a>
              )}
              {c.phone && <a href={`tel:${c.phone}`} className="text-slate-700 hover:underline">☎ {c.phone}</a>}
              {c.linkedinUrl && (
                <a href={c.linkedinUrl.startsWith("http") ? c.linkedinUrl : `https://${c.linkedinUrl}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">in↗</a>
              )}
              <span className="text-[10px] text-slate-400">{c.source}</span>
            </div>
          ))}
        </div>
      )}
      {lead.enrichment?.businessSummary && <p className="text-sm text-slate-600">{lead.enrichment.businessSummary}</p>}
      {lead.meta?.angle && <p className="rounded bg-amber-50 p-2 text-sm text-amber-900">Angle: {lead.meta.angle}</p>}
      {!!lead.enrichment?.brandsSold?.length && (
        <p className="text-xs text-slate-500">Brands: {lead.enrichment.brandsSold.join(", ")}</p>
      )}
      {!!lead.scoreReasons?.length && (
        <ul className="space-y-0.5 text-xs">
          {lead.scoreReasons.map((c, i) => (
            <li key={i} className={c.pass ? "text-emerald-700" : "text-red-600"}>
              {c.pass ? "✓" : "✗"} {c.check}: {c.evidence}
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {draft && showDraft && (
        <div className="space-y-2 rounded-lg border border-indigo-200 bg-indigo-50/50 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wide text-indigo-700">AI outreach draft</span>
            <div className="flex gap-2">
              <button onClick={makeDraft} disabled={drafting} className="rounded border border-indigo-300 px-2 py-0.5 text-xs text-indigo-700 hover:bg-indigo-100 disabled:opacity-50">
                {drafting ? "Regenerating…" : "↻ Regenerate"}
              </button>
              <button onClick={() => setShowDraft(false)} className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-500">Hide</button>
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-slate-800">📧 {draft.emailSubject}</p>
              <CopyButton text={`Subject: ${draft.emailSubject}\n\n${draft.emailBody}`} label="Copy email" />
            </div>
            <p className="whitespace-pre-wrap text-sm text-slate-700">{draft.emailBody}</p>
          </div>
          <div className="space-y-1 border-t border-indigo-100 pt-2">
            <div className="flex items-center gap-2">
              <p className="text-xs font-bold text-slate-600">📞 Phone opener</p>
              <CopyButton text={draft.phoneOpener} label="Copy" />
            </div>
            <p className="text-sm italic text-slate-700">“{draft.phoneOpener}”</p>
            {draft.talkingPoints.length > 0 && (
              <ul className="list-inside list-disc text-xs text-slate-600">
                {draft.talkingPoints.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            )}
          </div>
        </div>
      )}

      {rejecting ? (
        <div className="space-y-2">
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reject reason (required — feeds exclusion rules)" className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={alsoExclude} onChange={(e) => setAlsoExclude(e.target.checked)} />
            Also add to protection list (collectors will never surface this company again)
          </label>
          <div className="flex gap-2">
            <button disabled={pending || !reason} onClick={() => act("REJECT")} className="rounded bg-red-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">Confirm reject</button>
            <button onClick={() => setRejecting(false)} className="rounded border px-3 py-1.5 text-sm">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button disabled={pending} onClick={() => act("FOLLOW")} className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">Follow up</button>
          <select value={repId} onChange={(e) => setRepId(e.target.value)} className="rounded border border-slate-300 px-2 py-1.5 text-sm">
            <option value="">Assign rep (optional)</option>
            {reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <button
            disabled={findingContacts}
            onClick={lookupContacts}
            className="rounded border border-emerald-300 px-3 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
          >
            {findingContacts ? "Searching…" : contacts.length > 0 ? "👤 Refresh contacts" : "👤 Find contacts"}
          </button>
          <button
            disabled={drafting}
            onClick={() => (draft && !showDraft ? setShowDraft(true) : makeDraft())}
            className="rounded border border-indigo-300 px-3 py-1.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
          >
            {drafting ? "Writing…" : draft ? "✉ Show AI draft" : "✉ AI draft"}
          </button>
          <button disabled={pending} onClick={() => setRejecting(true)} className="rounded border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-600">Not a target</button>
        </div>
      )}
    </div>
  );
}
