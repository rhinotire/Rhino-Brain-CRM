"use client";

import { useRef, useState } from "react";
import { searchProducts, type ProductHit } from "@/actions/products";
import { Input } from "@/components/ui/primitives";
import { fmtMoney } from "@/lib/domain";

export function stockLabel(hit: ProductHit): string {
  if (hit.stock.length === 0) return "no stock data";
  return hit.stock.map(s => `${s.tag}: ${s.qty}`).join(" · ");
}

/** Text input with live catalog search: dropdown shows per-warehouse stock; picking calls onPick. */
export function ProductPicker({ value, customerId, onType, onPick, placeholder, className }: {
  value: string;
  customerId?: string;
  onType: (v: string) => void;
  onPick: (hit: ProductHit) => void;
  placeholder?: string;
  className?: string;
}) {
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [openList, setOpenList] = useState(false);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const handleChange = (v: string) => {
    onType(v);
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length < 2) { setHits([]); setOpenList(false); return; }
    timer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await searchProducts(v, customerId);
        setHits(res);
        setOpenList(true);
      } finally {
        setSearching(false);
      }
    }, 300);
  };

  return (
    <div className="relative">
      <Input className={className ?? "h-8 text-xs"} placeholder={placeholder ?? "Size / SKU — type to search stock"}
        value={value}
        onChange={e => handleChange(e.target.value)}
        onFocus={() => hits.length > 0 && setOpenList(true)}
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
