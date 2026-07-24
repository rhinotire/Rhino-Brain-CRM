"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updatePortalOrderStatus } from "@/actions/portal-orders";
import { useToast } from "@/components/ui/toast";

const OPTIONS: [string, string][] = [
  ["SUBMITTED", "Submitted"],
  ["CONFIRMED", "Confirmed (in TireGuru)"],
  ["FULFILLED", "Fulfilled"],
  ["CANCELLED", "Cancelled"],
];

export function PortalOrderStatusSelect({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <select
      value={status}
      disabled={pending}
      className="rounded border border-slate-200 bg-white px-1.5 py-1 text-xs"
      onChange={(e) => {
        const next = e.target.value;
        start(async () => {
          const res = await updatePortalOrderStatus(id, next);
          if (res.ok) { toast("Status updated"); router.refresh(); }
          else toast(res.error ?? "Failed", "error");
        });
      }}
    >
      {OPTIONS.map(([v, l]) => (
        <option key={v} value={v}>{l}</option>
      ))}
    </select>
  );
}
