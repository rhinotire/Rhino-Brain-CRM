"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runCollection } from "@/actions/prospecting";

/** ADMIN "search for new prospects" form — runs the Places→AI pipeline
 * server-side (capped at 20/run; bigger sweeps via the CLI script). */
const STATES = ["FL", "TX", "GA", "AL", "SC", "NC", "TN", "MS", "OK", "LA", "AR", "NM"] as const;
const CATEGORIES = [
  { value: "p4", label: "P4 · Truck tires / fleets (priority)" },
  { value: "p3", label: "P3 · PCR / tire shops" },
  { value: "p1", label: "P1/P2 · Trailer tires / manufacturers" },
] as const;

export function ProspectCollectForm() {
  const router = useRouter();
  const [running, start] = useTransition();
  const [state, setState] = useState<string>("TX");
  const [category, setCategory] = useState<string>("p4");
  const [limit, setLimit] = useState(10);
  const [message, setMessage] = useState("");

  const run = () =>
    start(async () => {
      setMessage("Searching, enriching and scoring — this takes about 10-20 seconds per new company…");
      const r = await runCollection(state, category as "p4" | "p3" | "p1", limit);
      if (!r.ok || !r.result) { setMessage(`❌ ${r.error ?? "failed"}`); return; }
      const { created, dups, excluded, skipped } = r.result;
      setMessage(`✓ Done: ${created} new lead${created === 1 ? "" : "s"} added to the queue (${dups} already known, ${excluded} protected, ${skipped} skipped)`);
      router.refresh();
    });

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div>
        <label className="block text-xs font-semibold text-slate-500">State</label>
        <select value={state} onChange={(e) => setState(e.target.value)} className="rounded border border-slate-300 px-2 py-1.5 text-sm">
          {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-500">Target type</label>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded border border-slate-300 px-2 py-1.5 text-sm">
          {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-500">How many</label>
        <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="rounded border border-slate-300 px-2 py-1.5 text-sm">
          {[5, 10, 15, 20].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      <button
        onClick={run}
        disabled={running}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {running ? "Searching…" : "🔍 Find new prospects"}
      </button>
      {message && <p className="w-full text-sm text-slate-600">{message}</p>}
    </div>
  );
}
