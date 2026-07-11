"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateConsumerLeadStatus } from "@/actions/consumer-leads";
import { useToast } from "@/components/ui/toast";

const OPTIONS: [string, string][] = [
  ["INSTALLER_CONTACTED", "Store contacted"],
  ["INSTALLATION_REQUESTED", "Installation requested"],
  ["INSTALLATION_SCHEDULED", "Scheduled"],
  ["INSTALLATION_COMPLETED", "Completed"],
  ["MANUAL_ASSISTANCE_REQUIRED", "Needs help"],
  ["LOST", "Lost"],
  ["CANCELLED", "Cancelled"],
];

export function ConsumerLeadStatusSelect({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <select
      value={OPTIONS.some(([v]) => v === status) ? status : ""}
      disabled={pending}
      className="rounded border border-slate-200 bg-white px-1.5 py-1 text-xs"
      onChange={(e) => {
        const next = e.target.value;
        if (!next) return;
        start(async () => {
          const res = await updateConsumerLeadStatus(id, next);
          if (res.ok) { toast("Status updated"); router.refresh(); }
          else toast(res.error ?? "Failed", "error");
        });
      }}
    >
      <option value="" disabled>{status.replaceAll("_", " ").toLowerCase()}</option>
      {OPTIONS.map(([v, l]) => (
        <option key={v} value={v}>{l}</option>
      ))}
    </select>
  );
}
