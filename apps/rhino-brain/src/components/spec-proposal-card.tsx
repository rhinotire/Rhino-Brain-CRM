"use client";

import { useState, useTransition } from "react";
import { approveSpecProposal, rejectSpecProposal } from "@/actions/spec-review";

type ProposedField = { value: string | number; confidence: "high" | "medium" | "low" };

const CONF_STYLE: Record<string, string> = {
  high: "bg-emerald-100 text-emerald-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-orange-100 text-orange-700",
};

const FIELD_LABEL: Record<string, string> = {
  loadRange: "Load Range",
  plyRating: "Ply Rating",
  position: "Position",
  treadType: "Tread Type",
  construction: "Construction",
  loadIndex: "Load Index",
  speedRating: "Speed Rating",
  application: "Application",
  mileageWarrantyMiles: "Mileage Warranty",
};

export function SpecProposalCard(props: {
  proposalId: string;
  sku: string;
  brand: string | null;
  sizeSpec: string | null;
  description: string;
  category: string;
  fields: Record<string, ProposedField>;
  current: Record<string, string | number | null>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"approved" | "rejected" | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (form: HTMLFormElement, action: "approve" | "reject") => {
    const fd = new FormData(form);
    startTransition(async () => {
      const res = action === "approve" ? await approveSpecProposal(fd) : await rejectSpecProposal(fd);
      if (res.error) setError(res.error);
      else { setError(null); setDone(action === "approve" ? "approved" : "rejected"); }
    });
  };

  if (done) {
    return (
      <div className={`rounded-xl border px-4 py-3 text-sm ${done === "approved" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
        <span className="font-mono font-semibold">{props.sku}</span> — {done === "approved" ? "approved ✓" : "rejected"}
      </div>
    );
  }

  return (
    <form
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      onSubmit={(e) => { e.preventDefault(); submit(e.currentTarget, "approve"); }}
    >
      <input type="hidden" name="proposalId" value={props.proposalId} />
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-sm font-bold">{props.sku}</span>
        {props.sizeSpec && <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs">{props.sizeSpec}</span>}
        {props.brand && <span className="text-sm text-slate-600">{props.brand}</span>}
        <span className="text-xs text-slate-400">{props.category.replace("_TIRES", "")}</span>
      </div>
      <p className="mb-3 text-sm text-slate-500">{props.description}</p>

      <div className="mb-3 grid gap-2 sm:grid-cols-2">
        {Object.entries(props.fields).map(([field, pf]) => {
          const cur = props.current[field];
          const filledMeanwhile = cur !== null && cur !== undefined && cur !== "";
          return (
            <label key={field} className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm ${filledMeanwhile ? "border-slate-100 bg-slate-50 opacity-60" : "border-slate-200"}`}>
              <input type="checkbox" name={`use-${field}`} defaultChecked={!filledMeanwhile && pf.confidence !== "low"} className="h-4 w-4" />
              <span className="w-28 shrink-0 text-xs font-medium text-slate-600">{FIELD_LABEL[field] ?? field}</span>
              <input name={`value-${field}`} defaultValue={String(pf.value)} className="w-full min-w-0 rounded border border-slate-200 px-1.5 py-0.5 font-mono text-xs" />
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${CONF_STYLE[pf.confidence]}`}>{pf.confidence}</span>
              {filledMeanwhile && <span className="shrink-0 text-[10px] text-slate-400">has: {String(cur)}</span>}
            </label>
          );
        })}
      </div>

      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
          {pending ? "Saving…" : "Approve checked"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={(e) => submit(e.currentTarget.closest("form")!, "reject")}
          className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          Reject all
        </button>
      </div>
    </form>
  );
}
