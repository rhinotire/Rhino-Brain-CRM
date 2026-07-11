"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setDiscontinued } from "@/actions/products";
import { useToast } from "@/components/ui/toast";

export function DiscontinuedToggle({ productId, value }: { productId: string; value: boolean }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <button type="button" disabled={pending}
      title={value ? "Marked discontinued — flyer auto-pick will clear it first. Click to unmark." : "Mark as discontinued (clearance priority)"}
      className={`rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${value ? "bg-red-100 text-red-700 hover:bg-red-200" : "bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600"}`}
      onClick={() => start(async () => {
        const res = await setDiscontinued(productId, !value);
        if (res.ok) { toast(value ? "Unmarked" : "Marked discontinued — will be prioritized for clearance flyers"); router.refresh(); }
        else toast(res.error ?? "Failed", "error");
      })}>
      {pending ? "…" : value ? "DISC" : "mark"}
    </button>
  );
}
