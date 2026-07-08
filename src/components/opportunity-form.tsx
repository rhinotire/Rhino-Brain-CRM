"use client";

import { useEffect, useState, useTransition } from "react";
import { useFormState } from "react-dom";
import { createOpportunity, setOpportunityStatus } from "@/actions/quotes";
import { Modal } from "@/components/ui/modal";
import { Button, Input, Select, Field } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { useToast } from "@/components/ui/toast";
import { probabilityLabels, productLabels } from "@/lib/domain";
import type { CustomerOption } from "./quick-log";
import type { OpportunityStatus } from "@prisma/client";

export function NewOpportunityButton({ customers, defaultCustomerId }: { customers: CustomerOption[]; defaultCustomerId?: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useFormState(createOpportunity, null);
  const toast = useToast();

  useEffect(() => {
    if (state?.ok) { toast("Opportunity created"); setOpen(false); }
    if (state?.error) toast(state.error, "error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <>
      <Button onClick={() => setOpen(true)}>+ New Opportunity</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="New Product Opportunity">
        <form action={action} className="space-y-3">
          <Field label="Customer *">
            <Select name="customerId" defaultValue={defaultCustomerId ?? ""} required>
              <option value="" disabled>Select customer…</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Product Category *">
              <Select name="category" defaultValue="PCR_TIRES">
                {Object.entries(productLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
            <Field label="Probability">
              <Select name="probability" defaultValue="MEDIUM">
                {Object.entries(probabilityLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Est. Monthly Volume"><Input name="estMonthlyVolume" placeholder="e.g. 200 tires / month" /></Field>
            <Field label="Target Price ($)"><Input name="targetPrice" type="number" step="0.01" min="0" placeholder="Per unit" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Current Supplier"><Input name="currentSupplier" placeholder="Who supplies them now?" /></Field>
            <Field label="Competitor Brand"><Input name="competitorBrand" placeholder="e.g. Westlake" /></Field>
          </div>
          <Field label="Next Action"><Input name="nextAction" placeholder="e.g. Send ST235/80R16 sample pricing" /></Field>
          {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <SubmitButton>Create</SubmitButton>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function OpportunityActions({ id, status }: { id: string; status: OpportunityStatus }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  if (status !== "OPEN") return null;
  const set = (s: OpportunityStatus) => start(async () => {
    const r = await setOpportunityStatus(id, s);
    toast(r.ok ? "Updated" : r.error!, r.ok ? "success" : "error");
  });
  return (
    <div className="flex gap-1.5">
      <Button size="sm" variant="success" disabled={pending} onClick={() => set("WON")}>Won</Button>
      <Button size="sm" variant="danger" disabled={pending} onClick={() => set("LOST")}>Lost</Button>
    </div>
  );
}
