"use client";

import { useState, useTransition } from "react";
import { calibrateLead } from "@/actions/prospecting";

type Check = { check: string; pass: boolean; evidence: string };
type Props = {
  lead: {
    id: string; companyName: string; city: string | null; state: string | null;
    pool: string | null; confidence: string | null; productLine: string | null; score: number | null;
    email: string | null; phone: string | null;
    scoreReasons: Check[] | null;
    enrichment: { businessSummary?: string; brandsSold?: string[]; buyerSignals?: string[]; emails?: string[] } | null;
    meta: { website?: string; angle?: string } | null;
  };
  reps: Array<{ id: string; name: string }>;
};

const POOL_COLORS: Record<string, string> = {
  A_BUYER: "bg-emerald-100 text-emerald-800",
  B_PROJECT: "bg-blue-100 text-blue-800",
  C_CHANNEL: "bg-amber-100 text-amber-800",
  D_EXCLUDED: "bg-slate-200 text-slate-600",
};

export function ProspectCard({ lead, reps }: Props) {
  const [pending, start] = useTransition();
  const [repId, setRepId] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [alsoExclude, setAlsoExclude] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const act = (verdict: "FOLLOW" | "REJECT") =>
    start(async () => {
      const r = await calibrateLead(lead.id, verdict, { repId: repId || undefined, reason, alsoExclude });
      if (!r.ok) setError(r.error ?? "failed");
      else setDone(true);
    });

  if (done) return null;

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

      {lead.meta?.website && (
        <a href={lead.meta.website.startsWith("http") ? lead.meta.website : `https://${lead.meta.website}`} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline">
          {lead.meta.website}
        </a>
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
          <button disabled={pending} onClick={() => setRejecting(true)} className="rounded border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-600">Not a target</button>
        </div>
      )}
    </div>
  );
}
