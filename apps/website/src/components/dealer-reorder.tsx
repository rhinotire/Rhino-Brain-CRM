"use client";

import { useRouter } from "next/navigation";
import type { CartLine } from "@/components/dealer-cart";

/** One-click reorder: merge a past order's lines into the cart draft and go
 * to checkout. Prices shown are today's indicative ones — the server reprices
 * at the dealer's tier on submit regardless. */
export function ReorderButton({ lines }: { lines: CartLine[] }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        try {
          const KEY = "dealer_cart_v1";
          const cart: CartLine[] = JSON.parse(localStorage.getItem(KEY) ?? "[]");
          for (const line of lines) {
            const hit = cart.find((l) => l.sku === line.sku);
            if (hit) hit.qty += line.qty;
            else cart.push({ ...line });
          }
          localStorage.setItem(KEY, JSON.stringify(cart));
          window.dispatchEvent(new Event("dealer-cart"));
        } catch {}
        router.push("/dealer/cart");
      }}
      className="rounded-lg bg-navy-900 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white hover:bg-navy-800"
    >
      ↻ Reorder
    </button>
  );
}
