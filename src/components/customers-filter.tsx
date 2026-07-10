"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input, Select, Button } from "@/components/ui/primitives";

type Opt = [string, string];

/** Customer list filters — dropdowns apply instantly; the search box applies on Enter / Search. */
export function CustomersFilter({ statuses, types, interests, reps }: {
  statuses: Opt[]; types: Opt[]; interests: Opt[]; reps: { id: string; name: string }[];
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");

  const apply = (patch: Record<string, string>) => {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) params.set(k, v); else params.delete(k); }
    router.push(`/customers?${params.toString()}`);
  };

  return (
    <form className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-4 xl:grid-cols-8"
      onSubmit={e => { e.preventDefault(); apply({ q }); }}>
      <Input name="q" placeholder="Search name / phone / email / city / tag" value={q} onChange={e => setQ(e.target.value)} className="col-span-2" />
      <Select value={sp.get("status") ?? ""} onChange={e => apply({ status: e.target.value })}>
        <option value="">All statuses</option>
        {statuses.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </Select>
      <Select value={sp.get("type") ?? ""} onChange={e => apply({ type: e.target.value })}>
        <option value="">All types</option>
        {types.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </Select>
      <Select value={sp.get("interest") ?? ""} onChange={e => apply({ interest: e.target.value })}>
        <option value="">All products</option>
        {interests.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </Select>
      {reps.length > 0 && (
        <Select value={sp.get("rep") ?? ""} onChange={e => apply({ rep: e.target.value })}>
          <option value="">All reps</option>
          {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
      )}
      <Select value={sp.get("lastContact") ?? ""} onChange={e => apply({ lastContact: e.target.value })}>
        <option value="">Any last contact</option>
        <option value="7">Not contacted 7d+</option>
        <option value="14">Not contacted 14d+</option>
        <option value="30">Not contacted 30d+</option>
        <option value="60">Not contacted 60d+</option>
        <option value="90">Not contacted 90d+</option>
      </Select>
      <div className="flex gap-2">
        <Select value={sp.get("followUp") ?? ""} onChange={e => apply({ followUp: e.target.value })}>
          <option value="">Any follow-up</option>
          <option value="today">Follow-up today</option>
          <option value="overdue">Follow-up overdue</option>
        </Select>
        <Button type="submit" variant="secondary">Search</Button>
      </div>
    </form>
  );
}
