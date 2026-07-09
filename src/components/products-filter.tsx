"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input, Select, Button } from "@/components/ui/primitives";

/** Product list filters — dropdowns apply instantly; the search box applies on Enter / Search. */
export function ProductsFilter({ categories }: { categories: string[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");

  const apply = (patch: Record<string, string>) => {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) params.set(k, v); else params.delete(k);
    }
    router.push(`/products?${params.toString()}`);
  };

  return (
    <form className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-5"
      onSubmit={e => { e.preventDefault(); apply({ q }); }}>
      <Input name="q" placeholder="Search size / SKU / brand / description — e.g. 205/75"
        value={q} onChange={e => setQ(e.target.value)} className="col-span-2" />
      <Select value={sp.get("cat") ?? ""} onChange={e => apply({ cat: e.target.value })}>
        <option value="">All categories</option>
        {categories.map(c => <option key={c} value={c}>{c}</option>)}
      </Select>
      <Select value={sp.get("stock") ?? ""} onChange={e => apply({ stock: e.target.value })}>
        <option value="">Any stock</option>
        <option value="in">In stock</option>
        <option value="out">Out of stock</option>
      </Select>
      <Button type="submit" variant="secondary">Search</Button>
    </form>
  );
}
