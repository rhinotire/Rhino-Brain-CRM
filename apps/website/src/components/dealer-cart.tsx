"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { submitDealerOrder } from "@/app/dealer/catalog/order-actions";

/**
 * Portal order cart (dealer portal Phase 2). Client-side draft only — prices
 * shown here are indicative; the server re-resolves every price at the
 * dealer's tier on submit and ignores anything the client sends but sku+qty.
 */

export type CartLine = { sku: string; label: string; size: string | null; price: number | null; qty: number };

type CartCtx = {
  lines: CartLine[];
  add: (line: Omit<CartLine, "qty">, qty: number) => void;
  setQty: (sku: string, qty: number) => void;
  remove: (sku: string) => void;
  clear: () => void;
};

const Ctx = createContext<CartCtx | null>(null);
const STORAGE = "dealer_cart_v1";

export function DealerCartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE);
      if (raw) setLines(JSON.parse(raw));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(lines));
    } catch {}
  }, [lines]);

  const api = useMemo<CartCtx>(
    () => ({
      lines,
      add: (line, qty) =>
        setLines((prev) => {
          const hit = prev.find((l) => l.sku === line.sku);
          return hit
            ? prev.map((l) => (l.sku === line.sku ? { ...l, qty: l.qty + qty } : l))
            : [...prev, { ...line, qty }];
        }),
      setQty: (sku, qty) => setLines((prev) => prev.map((l) => (l.sku === sku ? { ...l, qty: Math.max(1, qty) } : l))),
      remove: (sku) => setLines((prev) => prev.filter((l) => l.sku !== sku)),
      clear: () => setLines([]),
    }),
    [lines],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export const useDealerCart = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDealerCart outside DealerCartProvider");
  return ctx;
};

/** Qty stepper + add button rendered under each product card in dealer mode. */
export function AddToOrder({ sku, label, size, price }: { sku: string; label: string; size: string | null; price: number | null }) {
  const { add } = useDealerCart();
  const [qty, setQty] = useState(4);
  const [added, setAdded] = useState(false);
  return (
    <div className="mt-2 flex items-center gap-1.5">
      <input
        type="number" min={1} max={2000} value={qty} aria-label={`Quantity for ${sku}`}
        onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
        className="w-16 rounded-lg border border-steel-300 px-2 py-1.5 text-center text-sm"
      />
      <button
        type="button"
        onClick={() => {
          add({ sku, label, size, price }, qty);
          setAdded(true);
          setTimeout(() => setAdded(false), 1200);
        }}
        className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-bold uppercase tracking-wide transition ${added ? "bg-emerald-600 text-white" : "bg-navy-900 text-white hover:bg-navy-800"}`}
      >
        {added ? "Added ✓" : "Add to Order"}
      </button>
    </div>
  );
}

/** Fixed bottom bar: review lines, PO/notes, submit. */
export function DealerCartBar() {
  const { lines, setQty, remove, clear } = useDealerCart();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const units = lines.reduce((s, l) => s + l.qty, 0);
  const total = lines.reduce((s, l) => s + (l.price ?? 0) * l.qty, 0);
  if (!lines.length) return null;

  async function submit(formData: FormData) {
    setPending(true);
    setError(null);
    const res = await submitDealerOrder({
      items: lines.map((l) => ({ sku: l.sku, quantity: l.qty })),
      poNumber: String(formData.get("po") ?? ""),
      notes: String(formData.get("notes") ?? ""),
    });
    setPending(false);
    if (res.ok) {
      clear();
      router.push(`/dealer/orders?submitted=${encodeURIComponent(res.requestNumber)}`);
    } else {
      setError(res.error);
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-navy-800 bg-navy-900 text-white shadow-2xl">
      <div className="mx-auto max-w-6xl px-4">
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between py-3 text-left">
          <span className="text-sm font-bold">
            Order draft: {lines.length} SKU{lines.length > 1 ? "s" : ""} · {units} units
            <span className="ml-2 text-brand-light">${total.toFixed(2)}</span>
          </span>
          <span className="text-xs font-bold uppercase tracking-wide text-steel-300">{open ? "Hide ▾" : "Review & Submit ▴"}</span>
        </button>

        {open && (
          <div className="max-h-[50vh] overflow-y-auto border-t border-navy-800 pb-4">
            <table className="mt-3 w-full text-left text-xs">
              <thead>
                <tr className="text-steel-400">
                  <th className="py-1 pr-2 font-semibold">Item</th>
                  <th className="py-1 pr-2 font-semibold">Qty</th>
                  <th className="py-1 pr-2 text-right font-semibold">Price</th>
                  <th className="py-1 pr-2 text-right font-semibold">Line</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.sku} className="border-t border-navy-800">
                    <td className="py-1.5 pr-2">
                      <span className="font-bold">{l.size ?? l.sku}</span>
                      <span className="block text-steel-400">{l.label}</span>
                    </td>
                    <td className="py-1.5 pr-2">
                      <input type="number" min={1} value={l.qty} aria-label={`Quantity for ${l.sku}`}
                        onChange={(e) => setQty(l.sku, Number(e.target.value) || 1)}
                        className="w-16 rounded border-0 px-1.5 py-1 text-center text-xs text-navy-900" />
                    </td>
                    <td className="py-1.5 pr-2 text-right">{l.price !== null ? `$${l.price.toFixed(2)}` : "rep"}</td>
                    <td className="py-1.5 pr-2 text-right font-bold">{l.price !== null ? `$${(l.price * l.qty).toFixed(2)}` : "—"}</td>
                    <td className="py-1.5 text-right">
                      <button type="button" onClick={() => remove(l.sku)} className="text-steel-400 hover:text-white" aria-label={`Remove ${l.sku}`}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <form action={submit} className="mt-3 flex flex-wrap items-end gap-2">
              <div>
                <label htmlFor="cart-po" className="block text-[10px] font-bold uppercase tracking-wide text-steel-400">Your PO # (optional)</label>
                <input id="cart-po" name="po" className="mt-1 w-40 rounded-lg border-0 px-2.5 py-2 text-xs text-navy-900" />
              </div>
              <div className="min-w-[200px] flex-1">
                <label htmlFor="cart-notes" className="block text-[10px] font-bold uppercase tracking-wide text-steel-400">Notes for your rep (optional)</label>
                <input id="cart-notes" name="notes" placeholder="Delivery instructions, timing…" className="mt-1 w-full rounded-lg border-0 px-2.5 py-2 text-xs text-navy-900" />
              </div>
              <button disabled={pending} className="btn-gold shrink-0">
                {pending ? "Submitting…" : `Submit Order · $${total.toFixed(2)}`}
              </button>
            </form>
            {error && <p className="mt-2 rounded-lg bg-red-500/20 px-3 py-2 text-xs font-semibold text-red-200">{error}</p>}
            <p className="mt-2 text-[10px] text-steel-400">
              Prices confirmed by your rep on final invoice · freight & FET per your terms · submitting sends this to your rep, it does not charge anything.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
