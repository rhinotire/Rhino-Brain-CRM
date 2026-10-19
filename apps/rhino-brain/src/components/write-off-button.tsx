"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCustomerWriteOff, writeOffUnmatchedAr } from "@/actions/collections";
import { Modal } from "@/components/ui/modal";
import { Button, Textarea, Field } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

/** A/R bad-debt control: 💀 Write off marks the whole customer (all invoices
 * leave the aging stats); Restore brings them back. Audited server-side.
 * Rows with no CRM customer record (TireGuru-only names) pass locationId
 * instead of customerId — the server auto-creates an INACTIVE archive. */
export function WriteOffButton({ customerId, companyName, writtenOff, locationId }: {
  customerId: string | null; companyName: string; writtenOff: boolean; locationId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const router = useRouter();

  const run = (writeOff: boolean) => {
    startTransition(async () => {
      const r = customerId
        ? await setCustomerWriteOff(customerId, writeOff, note)
        : writeOff && locationId
          ? await writeOffUnmatchedAr(companyName, locationId, note)
          : { ok: false as const, error: "Missing customer reference" };
      if (r.ok) {
        toast(writeOff ? `${companyName} written off — removed from aging` : `${companyName} restored to aging`);
        setOpen(false);
        router.refresh();
      } else toast(r.error ?? "Failed", "error");
    });
  };

  if (writtenOff) {
    return (
      <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(false)}>
        ↩ Restore
      </Button>
    );
  }
  return (
    <>
      <Button size="sm" variant="secondary" className="text-slate-500" onClick={() => setOpen(true)}>💀 Write off</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Write off — ${companyName}`}>
        <div className="space-y-3 text-sm">
          <p className="text-slate-600">
            All of this customer&apos;s balances leave the A/R aging totals and the collections queue.
            This is reversible (filter “Written off” → Restore) and the action is logged.
          </p>
          <Field label="Reason (recommended)">
            <Textarea rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="Closed / out of business / bankruptcy / uncollectable…" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending} onClick={() => run(true)}>{pending ? "Saving…" : "💀 Write off"}</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
