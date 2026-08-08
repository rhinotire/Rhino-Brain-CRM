"use client";

import { useState, useTransition } from "react";
import { setCustomerInactive, reactivateCustomer } from "@/actions/customers";
import { Modal } from "@/components/ui/modal";
import { Button, Textarea } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

const REASONS = ["Out of business", "Bad payment history", "Switched supplier", "Unresponsive", "Price — no deal", "Duplicate account"];

export function MarkInactiveButton({ customerId }: { customerId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();

  return (
    <>
      <Button variant="secondary" size="md" onClick={() => setOpen(true)}>Mark Inactive</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Mark customer INACTIVE">
        <div className="space-y-3">
          <p className="text-sm text-slate-500">Set this customer to INACTIVE and note why. The reason is saved on the profile and logged in the activity trail.</p>
          <div className="flex flex-wrap gap-1.5">
            {REASONS.map(r => (
              <button key={r} type="button" onClick={() => setReason(r)}
                className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-600 hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700">
                {r}
              </button>
            ))}
          </div>
          <Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (required) — e.g. closed down, went to competitor…" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" variant="danger" disabled={pending || !reason.trim()}
              onClick={() => start(async () => {
                const r = await setCustomerInactive(customerId, reason.trim());
                if (r.ok) { toast("Customer marked inactive"); setOpen(false); } else toast(r.error!, "error");
              })}>
              {pending ? "Saving…" : "Mark Inactive"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export function ReactivateButton({ customerId }: { customerId: string }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <Button variant="secondary" size="sm" disabled={pending}
      onClick={() => start(async () => {
        const r = await reactivateCustomer(customerId);
        toast(r.ok ? "Customer reactivated" : r.error!, r.ok ? "success" : "error");
      })}>
      {pending ? "…" : "Reactivate"}
    </Button>
  );
}
