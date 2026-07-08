"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createQuote, setQuoteStatus, setQuoteFollowUp } from "@/actions/quotes";
import { searchProducts, type ProductHit } from "@/actions/products";
import { Modal } from "@/components/ui/modal";
import { Button, Input, Select, Textarea, Field, Label } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { productLabels, fmtMoney } from "@/lib/domain";
import type { CustomerOption } from "./quick-log";
import type { QuoteStatus } from "@prisma/client";

type Item = { category: string; description: string; sizeSku: string; brand: string; quantity: number; unitPrice: number; stockNote?: string; stockTotal?: number };
const emptyItem = (): Item => ({ category: "PCR_TIRES", description: "", sizeSku: "", brand: "", quantity: 4, unitPrice: 0 });

function stockLabel(hit: ProductHit): string {
  if (hit.stock.length === 0) return "no stock data";
  return hit.stock.map(s => `${s.tag}: ${s.qty}`).join(" · ");
}

/** Size/SKU input with live product search: shows per-warehouse stock, autofills the line. */
function ProductPicker({ value, customerId, onType, onPick }: {
  value: string;
  customerId?: string;
  onType: (v: string) => void;
  onPick: (hit: ProductHit) => void;
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
      <Input className="h-8 text-xs" placeholder="Size / SKU — type to search stock"
        value={value}
        onChange={e => handleChange(e.target.value)}
        onFocus={() => hits.length > 0 && setOpenList(true)}
        onBlur={() => setTimeout(() => setOpenList(false), 200)} />
      {searching && <span className="absolute right-2 top-1.5 text-xs text-slate-400">…</span>}
      {openList && hits.length > 0 && (
        <div className="absolute left-0 top-9 z-50 max-h-64 w-[28rem] overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
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

export function NewQuoteButton({ customers, defaultCustomerId, label = "+ New Quote" }: {
  customers: CustomerOption[]; defaultCustomerId?: string; label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([emptyItem()]);
  const [customerId, setCustomerId] = useState(defaultCustomerId ?? "");
  const [expirationDate, setExpirationDate] = useState("");
  const [nextFollowUpAt, setNextFollowUpAt] = useState("");
  const [competitorPrice, setCompetitorPrice] = useState("");
  const [competitorBrand, setCompetitorBrand] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  const total = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const setItem = (idx: number, patch: Partial<Item>) =>
    setItems(list => list.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const submit = () => start(async () => {
    const res = await createQuote({
      customerId, expirationDate, nextFollowUpAt, competitorPrice, competitorBrand, notes,
      items,
    });
    if (res.ok) {
      toast("Quote created as draft");
      setOpen(false);
      setItems([emptyItem()]);
      router.refresh();
    } else toast(res.error!, "error");
  });

  return (
    <>
      <Button onClick={() => setOpen(true)}>{label}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="New Quote" wide>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Customer *">
              <Select value={customerId} onChange={e => setCustomerId(e.target.value)}>
                <option value="" disabled>Select customer…</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
              </Select>
            </Field>
            <Field label="Expiration Date">
              <Input type="date" value={expirationDate} onChange={e => setExpirationDate(e.target.value)} />
            </Field>
          </div>

          <div>
            <Label>Line Items</Label>
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="rounded-md border border-slate-100 bg-slate-50 p-2">
                  <div className="grid grid-cols-12 items-end gap-2">
                    <div className="col-span-3">
                      <ProductPicker value={it.sizeSku} customerId={customerId || undefined}
                        onType={v => setItem(i, { sizeSku: v, stockNote: undefined, stockTotal: undefined })}
                        onPick={h => setItem(i, {
                          sizeSku: h.sizeSpec ?? h.sku,
                          description: h.description,
                          brand: h.brand ?? "",
                          category: h.category,
                          ...(h.tierPrice !== null ? { unitPrice: h.tierPrice } : {}),
                          stockNote: `${h.sku} — stock ${stockLabel(h)}`,
                          stockTotal: h.stock.reduce((s, x) => s + x.qty, 0),
                        })} />
                    </div>
                    <div className="col-span-3"><Input className="h-8 text-xs" placeholder="Description *" value={it.description} onChange={e => setItem(i, { description: e.target.value })} /></div>
                    <div className="col-span-2">
                      <Select value={it.category} onChange={e => setItem(i, { category: e.target.value })} className="h-8 text-xs">
                        {Object.entries(productLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </Select>
                    </div>
                    <div className="col-span-1"><Input className="h-8 text-xs" placeholder="Brand" value={it.brand} onChange={e => setItem(i, { brand: e.target.value })} /></div>
                    <div className="col-span-1"><Input className="h-8 text-xs" type="number" min={1} value={it.quantity} onChange={e => setItem(i, { quantity: Number(e.target.value) })} /></div>
                    <div className="col-span-1"><Input className="h-8 text-xs" type="number" min={0} step="0.01" value={it.unitPrice} onChange={e => setItem(i, { unitPrice: Number(e.target.value) })} /></div>
                    <button className="col-span-1 h-8 rounded text-xs text-red-500 hover:bg-red-50" onClick={() => setItems(l => l.filter((_, x) => x !== i))} disabled={items.length === 1}>Remove</button>
                  </div>
                  {it.stockNote && (
                    <div className={`mt-1 text-xs font-medium ${it.stockTotal !== undefined && it.quantity > it.stockTotal ? "text-amber-600" : "text-emerald-700"}`}>
                      📦 {it.stockNote}
                      {it.stockTotal !== undefined && it.quantity > it.stockTotal && ` — ⚠ quoting ${it.quantity}, only ${it.stockTotal} on hand`}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <Button variant="secondary" size="sm" onClick={() => setItems(l => [...l, emptyItem()])}>+ Add line</Button>
              <div className="text-sm font-semibold">Total: {fmtMoney(total)}</div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Competitor Price ($)"><Input type="number" step="0.01" value={competitorPrice} onChange={e => setCompetitorPrice(e.target.value)} /></Field>
            <Field label="Competitor Brand"><Input value={competitorBrand} onChange={e => setCompetitorBrand(e.target.value)} /></Field>
            <Field label="Next Follow-up"><Input type="date" value={nextFollowUpAt} onChange={e => setNextFollowUpAt(e.target.value)} /></Field>
          </div>
          <Field label="Notes"><Textarea value={notes} onChange={e => setNotes(e.target.value)} /></Field>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={pending || !customerId || items.some(i => !i.description)}>
              {pending ? "Saving…" : "Create quote"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export function QuoteStatusActions({ quoteId, status }: { quoteId: string; status: QuoteStatus }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const set = (s: QuoteStatus) => start(async () => {
    const r = await setQuoteStatus(quoteId, s);
    toast(r.ok ? "Quote updated" : r.error!, r.ok ? "success" : "error");
  });

  return (
    <div className="flex flex-wrap gap-1.5">
      {status === "DRAFT" && <Button size="sm" onClick={() => set("SENT")} disabled={pending}>Mark Sent</Button>}
      {(status === "SENT" || status === "FOLLOW_UP_NEEDED") && (
        <>
          <Button size="sm" variant="success" onClick={() => set("ACCEPTED")} disabled={pending}>Accept</Button>
          <Button size="sm" variant="danger" onClick={() => set("REJECTED")} disabled={pending}>Reject</Button>
        </>
      )}
      {(status === "SENT" || status === "FOLLOW_UP_NEEDED") && (
        <Button size="sm" variant="secondary" disabled={pending}
          onClick={() => {
            const d = prompt("Follow-up date (YYYY-MM-DD):", new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10));
            if (d) start(async () => { const r = await setQuoteFollowUp(quoteId, d); toast(r.ok ? "Reminder set" : r.error!, r.ok ? "success" : "error"); });
          }}>
          Set Reminder
        </Button>
      )}
    </div>
  );
}
