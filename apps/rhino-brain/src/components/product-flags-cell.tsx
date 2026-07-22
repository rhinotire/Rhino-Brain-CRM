"use client";

import { useState, useTransition } from "react";
import { toggleProductFlag } from "@/actions/products";
import { useToast } from "@/components/ui/toast";

/** 🔥 Hot (bestSeller) and 💰 Deal (specialOffer) toggles — drive the homepage sections. */
export function ProductFlagsCell({ productId, bestSeller, specialOffer }: {
  productId: string; bestSeller: boolean; specialOffer: boolean;
}) {
  const [hot, setHot] = useState(bestSeller);
  const [deal, setDeal] = useState(specialOffer);
  const [pending, start] = useTransition();
  const toast = useToast();

  const flip = (flag: "bestSeller" | "specialOffer") =>
    start(async () => {
      const res = await toggleProductFlag(productId, flag);
      if (res.error) { toast(res.error, "error"); return; }
      if (flag === "bestSeller") setHot(res.value!); else setDeal(res.value!);
      toast(
        flag === "bestSeller"
          ? res.value ? "🔥 Marked Hot — shows in the homepage Hot section (~5 min)" : "Removed from Hot"
          : res.value ? "💰 Marked Deal — shows in Deals + homepage (~5 min)" : "Removed from Deals"
      );
    });

  const btn = (on: boolean) =>
    `rounded px-1.5 py-0.5 text-sm transition ${on ? "" : "opacity-25 grayscale hover:opacity-60"} disabled:cursor-wait`;

  return (
    <div className="flex items-center gap-1">
      <button type="button" title={hot ? "Hot — click to remove" : "Mark as Hot (homepage)"} disabled={pending}
        onClick={() => flip("bestSeller")} className={btn(hot)}>🔥</button>
      <button type="button" title={deal ? "Deal — click to remove" : "Mark as Deal (homepage + /deals)"} disabled={pending}
        onClick={() => flip("specialOffer")} className={btn(deal)}>💰</button>
    </div>
  );
}
