"use client";

import { useState, useTransition } from "react";
import { listPatternCandidates, applyPhotoToPattern, type PatternCandidate } from "@/actions/products";
import { useToast } from "@/components/ui/toast";

/**
 * "Apply this photo to the whole tread pattern" — one photo upload covers
 * every size of the same pattern. Also records the pattern name on the
 * selected products, building pattern data the import files never had.
 */
export function PatternPhotoShare({ productId, imageUrl }: { productId: string; imageUrl: string }) {
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<PatternCandidate[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [pattern, setPattern] = useState("");
  const [filter, setFilter] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();

  const load = () =>
    start(async () => {
      const res = await listPatternCandidates(productId);
      if (res.error) { toast(res.error, "error"); return; }
      setCandidates(res.candidates ?? []);
      setPattern(res.pattern ?? "");
      setOpen(true);
    });

  const apply = () =>
    start(async () => {
      const res = await applyPhotoToPattern(productId, [...checked], pattern);
      if (res.error) { toast(res.error, "error"); return; }
      toast(`Photo applied to ${res.applied} product${res.applied === 1 ? "" : "s"}${pattern.trim() ? ` · pattern "${pattern.trim()}" saved` : ""}`);
      setOpen(false);
      setChecked(new Set());
    });

  const shown = (candidates ?? []).filter((c) =>
    !filter.trim() || `${c.sku} ${c.sizeSpec ?? ""} ${c.description}`.toLowerCase().includes(filter.toLowerCase())
  );
  const toggle = (id: string) => {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id); else next.add(id);
    setChecked(next);
  };

  return (
    <>
      <button type="button" onClick={load} disabled={pending}
        className="text-xs text-blue-600 hover:underline disabled:opacity-50" title="Apply this photo to other sizes of the same tread pattern">
        share…
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 border-b border-slate-200 p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="" className="h-12 w-12 rounded-lg border border-slate-200 object-cover" />
              <div>
                <div className="text-sm font-bold">Apply photo to same tread pattern</div>
                <div className="text-xs text-slate-500">Pick the sizes that share this pattern — one photo covers them all.</div>
              </div>
            </div>
            <div className="space-y-2 p-4">
              <label className="block text-xs font-semibold text-slate-600" htmlFor={`pp-pattern-${productId}`}>
                Pattern name (optional — saved on all selected products)
              </label>
              <input id={`pp-pattern-${productId}`} value={pattern} onChange={(e) => setPattern(e.target.value)}
                placeholder='e.g. "ST-007", "CW516"' className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by SKU / size / description…"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
            </div>
            <div className="max-h-[40vh] overflow-y-auto border-t border-slate-100 px-4 pb-2">
              {shown.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 border-b border-slate-50 py-2 text-sm">
                  <input type="checkbox" checked={checked.has(c.id)} onChange={() => toggle(c.id)} className="h-4 w-4" />
                  <span className="font-mono text-xs font-semibold">{c.sku}</span>
                  <span className="text-xs text-slate-500">{c.sizeSpec}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-slate-400">{c.description}</span>
                  {c.hasPhoto && <span className="shrink-0 rounded bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-700">has photo</span>}
                </label>
              ))}
              {candidates && shown.length === 0 && <p className="py-4 text-center text-xs text-slate-400">No matching products.</p>}
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-slate-200 p-4">
              <span className="text-xs text-slate-500">{checked.size} selected</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cancel</button>
                <button type="button" onClick={apply} disabled={pending || checked.size === 0}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {pending ? "Applying…" : "Apply photo"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
