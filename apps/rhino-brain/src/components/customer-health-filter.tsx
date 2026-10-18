"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input, Select, Button } from "@/components/ui/primitives";

type Opt = [string, string];

/** Customer Health Report filters — dropdowns apply instantly; the search box applies on Enter / Search. */
export function CustomerHealthFilter({ temps, tiers, reps }: {
  temps: Opt[]; tiers: Opt[]; reps: { id: string; name: string }[];
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");

  const apply = (patch: Record<string, string>) => {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) params.set(k, v); else params.delete(k); }
    router.push(`/reports/customers?${params.toString()}`);
  };

  return (
    <form className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-6"
      onSubmit={e => { e.preventDefault(); apply({ q }); }}>
      <Input name="q" placeholder="Search customer / city" value={q} onChange={e => setQ(e.target.value)} className="col-span-2" />
      <Select value={sp.get("temp") ?? ""} onChange={e => apply({ temp: e.target.value })}>
        <option value="">Needs attention (Cooling → Never)</option>
        <option value="ALL">All temperatures</option>
        {temps.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </Select>
      <Select value={sp.get("tier") ?? ""} onChange={e => apply({ tier: e.target.value })}>
        <option value="">All tiers</option>
        {tiers.map(([v, l]) => <option key={v} value={v}>Tier {l}</option>)}
      </Select>
      <Select value={sp.get("rep") ?? ""} onChange={e => apply({ rep: e.target.value })}>
        <option value="">All reps</option>
        <option value="unassigned">Unassigned</option>
        {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
      </Select>
      <div className="flex gap-2">
        <Button type="submit" variant="secondary">Search</Button>
        {(sp.get("q") || sp.get("temp") || sp.get("tier") || sp.get("rep")) && (
          <Button type="button" variant="secondary" onClick={() => { setQ(""); router.push("/reports/customers"); }}>Clear</Button>
        )}
      </div>
    </form>
  );
}
