"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input, Select, Button } from "@/components/ui/primitives";

/** Product list filters — dropdowns and the search box all apply instantly (search is debounced). */
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

  // Live search: apply automatically ~350ms after the user stops typing (no Search click needed).
  const skipFirst = useRef(true);
  useEffect(() => {
    if (skipFirst.current) { skipFirst.current = false; return; }
    if (q === (sp.get("q") ?? "")) return; // already reflected in the URL
    const t = setTimeout(() => apply({ q }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

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
