"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPublished } from "@/actions/products";
import { useToast } from "@/components/ui/toast";

/** Manager toggle: publish a product to the public website (visibility PUBLIC/INTERNAL). */
export function WebPublishToggle({ productId, published }: { productId: string; published: boolean }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <button type="button" disabled={pending}
      title={published ? "Visible on the public website. Click to unpublish." : "Publish to the public website (price is never shown publicly)"}
      className={`rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${published ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600"}`}
      onClick={() => start(async () => {
        const res = await setPublished(productId, !published);
        if (res.ok) { toast(published ? "Removed from website" : "Published to website"); router.refresh(); }
        else toast(res.error ?? "Failed", "error");
      })}>
      {pending ? "…" : published ? "LIVE" : "publish"}
    </button>
  );
}
