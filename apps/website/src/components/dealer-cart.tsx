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
  // Guard: never persist before the initial load, or a fresh mount (e.g. the
  // cart page itself) would clobber the stored cart with [].
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE);
      if (raw) setLines(JSON.parse(raw));
    } catch {}
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE, JSON.stringify(lines));
      window.dispatchEvent(new Event("dealer-cart"));
    } catch {}
  }, [lines, loaded]);

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

/** Slim fixed bottom bar on the catalog: shows the draft, links to the cart. */
export function DealerCartBar() {
  const { lines } = useDealerCart();
  const units = lines.reduce((s, l) => s + l.qty, 0);
  const total = lines.reduce((s, l) => s + (l.price ?? 0) * l.qty, 0);
  if (!lines.length) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-navy-800 bg-navy-900 text-white shadow-2xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <span className="text-sm font-bold">
          Cart: {lines.length} SKU{lines.length > 1 ? "s" : ""} · {units} units
          <span className="ml-2 text-brand-light">${total.toFixed(2)}</span>
        </span>
        <a href="/dealer/cart" className="btn-gold shrink-0 !py-2 text-xs">View Cart & Checkout →</a>
      </div>
    </div>
  );
}

/** Item count for the portal nav "Cart" tab. Reads localStorage directly so it
 * works on pages outside the DealerCartProvider (orders, quick order). */
export function CartCount() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const read = () => {
      try {
        const l: CartLine[] = JSON.parse(localStorage.getItem(STORAGE) ?? "[]");
        setN(l.reduce((s, x) => s + x.qty, 0));
      } catch {
        setN(0);
      }
    };
    read();
    window.addEventListener("dealer-cart", read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener("dealer-cart", read);
      window.removeEventListener("storage", read);
    };
  }, []);
  if (!n) return null;
  return <span className="ml-1 rounded-full bg-brand px-1.5 text-[10px] font-black text-navy-900">{n}</span>;
}

/** Full cart page: review lines, edit quantities, PO/notes, place the order. */
export function CartView() {
  const { lines, setQty, remove, clear } = useDealerCart();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const units = lines.reduce((s, l) => s + l.qty, 0);
  const total = lines.reduce((s, l) => s + (l.price ?? 0) * l.qty, 0);

  if (!lines.length) {
    return (
      <p className="mt-6 rounded-2xl bg-steel-100 p-6 text-sm text-steel-500">
        Your cart is empty. Add items from the <a href="/dealer/catalog" className="font-bold text-brand-dark">catalog</a>.
      </p>
    );
  }

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
    <div className="mt-6">
      <div className="overflow-x-auto rounded-2xl border border-steel-200 bg-white shadow-card">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-steel-100 text-xs uppercase tracking-wide text-steel-400">
              <th className="px-4 py-2.5 font-semibold">Item</th>
              <th className="px-4 py-2.5 font-semibold">Qty</th>
              <th className="px-4 py-2.5 text-right font-semibold">Your Price</th>
              <th className="px-4 py-2.5 text-right font-semibold">Line Total</th>
              <th className="px-2 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.sku} className="border-b border-steel-50">
                <td className="px-4 py-3">
                  <span className="font-display font-bold text-navy-900">{l.size ?? l.sku}</span>
                  <span className="block text-xs text-steel-500">{l.label}</span>
                  <span className="block text-[11px] text-steel-400">SKU {l.sku}</span>
                </td>
                <td className="px-4 py-3">
                  <input type="number" min={1} max={2000} value={l.qty} aria-label={`Quantity for ${l.sku}`}
                    onChange={(e) => setQty(l.sku, Number(e.target.value) || 1)}
                    className="w-20 rounded-lg border border-steel-300 px-2 py-1.5 text-center text-sm" />
                </td>
                <td className="px-4 py-3 text-right">{l.price !== null ? `$${l.price.toFixed(2)}` : "Ask rep"}</td>
                <td className="px-4 py-3 text-right font-bold text-navy-900">{l.price !== null ? `$${(l.price * l.qty).toFixed(2)}` : "—"}</td>
                <td className="px-2 py-3 text-right">
                  <button type="button" onClick={() => remove(l.sku)} aria-label={`Remove ${l.sku}`}
                    className="rounded-md px-2 py-1 text-steel-400 hover:bg-red-50 hover:text-red-600">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="px-4 py-3 text-xs text-steel-500">{lines.length} SKU{lines.length > 1 ? "s" : ""} · {units} units</td>
              <td colSpan={2} className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-steel-500">Order total</td>
              <td className="px-4 py-3 text-right font-display text-lg font-bold text-navy-900">${total.toFixed(2)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <form action={submit} className="mt-5 max-w-xl space-y-3">
        <div className="flex flex-wrap gap-3">
          <div>
            <label htmlFor="cart-po" className="block text-xs font-bold uppercase tracking-wide text-steel-500">Your PO # (optional)</label>
            <input id="cart-po" name="po" className="mt-1 w-44 rounded-lg border border-steel-300 px-3 py-2 text-sm" />
          </div>
          <div className="min-w-[240px] flex-1">
            <label htmlFor="cart-notes" className="block text-xs font-bold uppercase tracking-wide text-steel-500">Notes for your rep (optional)</label>
            <input id="cart-notes" name="notes" placeholder="Delivery instructions, timing…" className="mt-1 w-full rounded-lg border border-steel-300 px-3 py-2 text-sm" />
          </div>
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p>}
        <button disabled={pending} className="btn-gold">
          {pending ? "Placing order…" : `Place Order · $${total.toFixed(2)}`}
        </button>
        <p className="text-[11px] text-steel-400">
          Placing the order sends it to your rep for confirmation — nothing is charged. Prices confirmed on final
          invoice; freight &amp; FET per your terms.
        </p>
      </form>
    </div>
  );
}
