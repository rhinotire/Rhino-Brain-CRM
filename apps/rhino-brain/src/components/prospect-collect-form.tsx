"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runCollection } from "@/actions/prospecting";

/** ADMIN "search for new prospects" form — runs the Places→AI pipeline
 * server-side (capped at 20/run; bigger sweeps via the CLI script).
 * US searches by state (Rhino/Everflow routing); other countries search
 * nationwide and route to Qingdao Rhino Tyre (international trade). */
const US_STATES = ["FL", "TX", "GA", "AL", "SC", "NC", "TN", "MS", "OK", "LA", "AR", "NM"] as const;
const COUNTRIES: Array<{ code: string; label: string }> = [
  { code: "US", label: "🇺🇸 United States" },
  { code: "CA", label: "🇨🇦 Canada" },
  { code: "MX", label: "🇲🇽 Mexico" },
  { code: "DO", label: "🇩🇴 Dominican Republic" },
  { code: "PA", label: "🇵🇦 Panama" },
  { code: "CR", label: "🇨🇷 Costa Rica" },
  { code: "GT", label: "🇬🇹 Guatemala" },
  { code: "HN", label: "🇭🇳 Honduras" },
  { code: "JM", label: "🇯🇲 Jamaica" },
  { code: "TT", label: "🇹🇹 Trinidad & Tobago" },
  { code: "CO", label: "🇨🇴 Colombia" },
  { code: "PE", label: "🇵🇪 Peru" },
  { code: "CL", label: "🇨🇱 Chile" },
  { code: "EC", label: "🇪🇨 Ecuador" },
  { code: "BR", label: "🇧🇷 Brazil" },
  { code: "AE", label: "🇦🇪 UAE (Dubai)" },
  { code: "SA", label: "🇸🇦 Saudi Arabia" },
  { code: "NG", label: "🇳🇬 Nigeria" },
  { code: "GH", label: "🇬🇭 Ghana" },
  { code: "KE", label: "🇰🇪 Kenya" },
  { code: "ZA", label: "🇿🇦 South Africa" },
  { code: "PH", label: "🇵🇭 Philippines" },
  { code: "TH", label: "🇹🇭 Thailand" },
  { code: "MY", label: "🇲🇾 Malaysia" },
  { code: "AU", label: "🇦🇺 Australia" },
  { code: "GB", label: "🇬🇧 United Kingdom" },
  { code: "DE", label: "🇩🇪 Germany" },
];
const CATEGORIES = [
  { value: "p4", label: "P4 · Truck tires / fleets (priority)" },
  { value: "p3", label: "P3 · PCR / tire shops" },
  { value: "p1", label: "P1/P2 · Trailer tires / manufacturers" },
  { value: "custom", label: "✏️ Custom keywords…" },
] as const;

export function ProspectCollectForm() {
  const router = useRouter();
  const [running, start] = useTransition();
  const [country, setCountry] = useState("US");
  const [state, setState] = useState("TX");
  const [category, setCategory] = useState("p4");
  const [customQuery, setCustomQuery] = useState("");
  const [limit, setLimit] = useState(10);
  const [message, setMessage] = useState("");

  const isCustom = category === "custom";
  const canRun = !isCustom || customQuery.trim().length >= 3;

  const run = () =>
    start(async () => {
      setMessage("Searching, enriching and scoring — about 10-20 seconds per new company…");
      const r = await runCollection({
        country,
        state: country === "US" ? state : undefined,
        category: isCustom ? undefined : (category as "p4" | "p3" | "p1"),
        customQuery: isCustom ? customQuery.trim() : undefined,
        limit,
      });
      if (!r.ok || !r.result) { setMessage(`❌ ${r.error ?? "failed"}`); return; }
      const { created, dups, excluded, skipped } = r.result;
      setMessage(`✓ Done: ${created} new lead${created === 1 ? "" : "s"} added (${dups} already known, ${excluded} protected, ${skipped} skipped)`);
      router.refresh();
    });

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div>
        <label className="block text-xs font-semibold text-slate-500">Country</label>
        <select value={country} onChange={(e) => setCountry(e.target.value)} className="rounded border border-slate-300 px-2 py-1.5 text-sm">
          {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
        </select>
      </div>
      {country === "US" && (
        <div>
          <label className="block text-xs font-semibold text-slate-500">State</label>
          <select value={state} onChange={(e) => setState(e.target.value)} className="rounded border border-slate-300 px-2 py-1.5 text-sm">
            {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      )}
      <div>
        <label className="block text-xs font-semibold text-slate-500">Target type</label>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded border border-slate-300 px-2 py-1.5 text-sm">
          {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>
      {isCustom && (
        <div className="min-w-[260px] flex-1">
          <label className="block text-xs font-semibold text-slate-500">Search keywords (any language)</label>
          <input
            value={customQuery}
            onChange={(e) => setCustomQuery(e.target.value)}
            placeholder={country === "US" ? "e.g. tire wholesale distributor" : "e.g. tire importer / importador de llantas"}
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
      )}
      <div>
        <label className="block text-xs font-semibold text-slate-500">How many</label>
        <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="rounded border border-slate-300 px-2 py-1.5 text-sm">
          {[5, 10, 15, 20].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      <button
        onClick={run}
        disabled={running || !canRun}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {running ? "Searching…" : "🔍 Find new prospects"}
      </button>
      {message && <p className="w-full text-sm text-slate-600">{message}</p>}
    </div>
  );
}
