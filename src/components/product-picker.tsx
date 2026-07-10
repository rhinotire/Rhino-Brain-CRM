"use client";

import { useRef, useState } from "react";
import { searchProducts, type ProductHit } from "@/actions/products";
import { Input, Select } from "@/components/ui/primitives";
import { fmtMoney } from "@/lib/domain";

export function stockLabel(hit: ProductHit): string {
  if (hit.stock.length === 0) return "no stock data";
  return hit.stock.map(s => `${s.tag}: ${s.qty}`).join(" · ");
}

/**
 * Text input with live catalog search: dropdown shows per-warehouse stock; picking calls onPick.
 * Pass `categories` to add a category filter — selecting one lists that category's products
 * even with no search text.
 */
export function ProductPicker({ value, customerId, onType, onPick, placeholder, className, categories, brands }: {
  value: string;
  customerId?: string;
  onType: (v: string) => void;
  onPick: (hit: ProductHit) => void;
  placeholder?: string;
  className?: string;
  categories?: string[];
  brands?: string[];
}) {
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [openList, setOpenList] = useState(false);
  const [searching, setSearching] = useState(false);
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const runSearch = async (v: string, cat: string, br: string) => {
    if (v.trim().length < 2 && !cat && !br) { setHits([]); setOpenList(false); return; }
    setSearching(true);
    try {
      const res = await searchProducts(v, customerId, cat || undefined, br || undefined);
      setHits(res);
      setOpenList(true);
    } finally {
      setSearching(false);
    }
  };

  const handleChange = (v: string) => {
    onType(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => runSearch(v, category, brand), 300);
  };

  const filterActive = category || brand;

  return (
    <div className="relative">
      {((categories && categories.length > 0) || (brands && brands.length > 0)) && (
        <div className="mb-1 flex gap-1">
          {categories && categories.length > 0 && (
            <Select value={category} onChange={e => { setCategory(e.target.value); runSearch(value, e.target.value, brand); }} className="h-8 text-xs">
              <option value="">All categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </Select>
          )}
          {brands && brands.length > 0 && (
            <Select value={brand} onChange={e => { setBrand(e.target.value); runSearch(value, category, e.target.value); }} className="h-8 text-xs">
              <option value="">All brands</option>
              {brands.map(b => <option key={b} value={b}>{b}</option>)}
            </Select>
          )}
        </div>
      )}
      <Input className={className ?? "h-8 text-xs"}
        placeholder={placeholder ?? (filterActive ? `Search within ${[brand, category].filter(Boolean).join(" · ")}…` : "Size / SKU — type to search stock")}
        value={value}
        onChange={e => handleChange(e.target.value)}
        onFocus={() => { if (hits.length > 0) setOpenList(true); else if (filterActive) runSearch(value, category, brand); }}
        onBlur={() => setTimeout(() => setOpenList(false), 200)} />
      {searching && <span className="absolute right-2 top-1.5 text-xs text-slate-400">…</span>}
      {openList && hits.length > 0 && (
        <div className="absolute left-0 top-9 z-50 max-h-64 w-[28rem] max-w-[90vw] overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {hits.map(h => {
            const totalQty = h.stock.reduce((s, x) => s + x.qty, 0);
            return (
              <button key={h.id} type="button"
                className="flex w-full items-center justify-between gap-2 border-b border-slate-50 px-3 py-2 text-left text-xs hover:bg-brand-50"
                onMouseDown={e => { e.preventDefault(); onPick(h); setOpenList(false); }}>
                <span className="min-w-0">
                  <span className="font-semibold">{h.sizeSpec ?? h.sku}</span>
                  {h.brand && <span className="text-slate-500"> · {h.brand}</span>}
                  <span className="block truncate text-slate-500">{h.description}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className={totalQty === 0 ? "font-semibold text-red-600" : totalQty <= 4 ? "font-semibold text-amber-600" : "font-semibold text-emerald-700"}>
                    {stockLabel(h)}
                  </span>
                  {h.tierPrice !== null && <span className="block text-slate-500">{fmtMoney(h.tierPrice)}</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {openList && hits.length === 0 && !searching && value.trim().length >= 2 && (
        <div className="absolute left-0 top-9 z-50 w-64 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-400 shadow-lg">
          No matching product — you can still type it manually.
        </div>
      )}
    </div>
  );
}
