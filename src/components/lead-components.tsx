"use client";

import { useEffect, useState, useTransition } from "react";
import { useFormState } from "react-dom";
import { createLead, moveLeadStage, markLeadLost, convertLead, assignLead } from "@/actions/leads";
import { Modal } from "@/components/ui/modal";
import { Button, Input, Select, Textarea, Field } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { useToast } from "@/components/ui/toast";
import {
  customerTypeLabels, customerSourceLabels, productLabels, stageLabels, stageOrder, lostReasonLabels,
} from "@/lib/domain";
import type { PipelineStage, LostReason } from "@prisma/client";

export function NewLeadButton({ reps, canAssign, locations, currentLocationId }: {
  reps: { id: string; name: string }[]; canAssign: boolean;
  locations?: { id: string; name: string; shortTag: string }[];
  currentLocationId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useFormState(createLead, null);
  const toast = useToast();

  useEffect(() => {
    if (state?.ok) { toast("Lead added"); setOpen(false); }
    if (state?.error) toast(state.error, "error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <>
      <Button onClick={() => setOpen(true)}>+ New Lead</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="New Lead" wide>
        <form action={action} className="grid grid-cols-2 gap-3">
          {locations && locations.length > 0 && (
            <Field label="Location *" className="col-span-2">
              <Select name="locationId" defaultValue={currentLocationId ?? locations[0].id}>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name} ({l.shortTag})</option>)}
              </Select>
            </Field>
          )}
          <Field label="Company Name *" className="col-span-2"><Input name="companyName" required /></Field>
          <Field label="Contact Person"><Input name="contactPerson" /></Field>
          <Field label="Phone"><Input name="phone" /></Field>
          <Field label="Email"><Input name="email" type="email" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="City"><Input name="city" /></Field>
            <Field label="State"><Input name="state" maxLength={2} placeholder="FL" /></Field>
          </div>
          <Field label="Customer Type">
            <Select name="type" defaultValue="TIRE_SHOP">
              {Object.entries(customerTypeLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </Field>
          <Field label="Source">
            <Select name="source" defaultValue="COLD_CALL">
              {Object.entries(customerSourceLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </Field>
          <Field label="Product Interest">
            <Select name="interest" defaultValue="PCR_TIRES">
              {Object.entries(productLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </Field>
          {canAssign && (
            <Field label="Assign To">
              <Select name="assignedRepId" defaultValue="">
                <option value="">Unassigned</option>
                {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Next Follow-up"><Input name="nextFollowUpAt" type="date" /></Field>
          <Field label="Notes" className="col-span-2"><Textarea name="notes" /></Field>
          {state?.error && <p className="col-span-2 text-sm text-red-600">{state.error}</p>}
          <div className="col-span-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <SubmitButton>Add lead</SubmitButton>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function LeadCardActions({ leadId, stage, canAssign, reps, assignedRepId }: {
  leadId: string; stage: PipelineStage; canAssign: boolean;
  reps: { id: string; name: string }[]; assignedRepId: string | null;
}) {
  const [pending, start] = useTransition();
  const [lostOpen, setLostOpen] = useState(false);
  const [reason, setReason] = useState<LostReason>("NO_RESPONSE");
  const [note, setNote] = useState("");
  const toast = useToast();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) =>
    start(async () => { const r = await fn(); toast(r.ok ? okMsg : r.error!, r.ok ? "success" : "error"); });

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex gap-1.5">
        <Select
          className="h-7 flex-1 text-xs"
          value={stage}
          disabled={pending}
          onChange={e => run(() => moveLeadStage(leadId, e.target.value as PipelineStage), "Stage updated")}
        >
          {stageOrder.filter(s => s !== "LOST").map(s => <option key={s} value={s}>{stageLabels[s]}</option>)}
          <option value="LOST">Lost</option>
        </Select>
      </div>
      {canAssign && (
        <Select
          className="h-7 w-full text-xs"
          value={assignedRepId ?? ""}
          disabled={pending}
          onChange={e => run(() => assignLead(leadId, e.target.value), "Lead reassigned")}
        >
          <option value="">Unassigned</option>
          {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
      )}
      <div className="flex gap-1.5">
        {stage !== "LOST" && stage !== "ACTIVE_CUSTOMER" && (
          <>
            <Button size="sm" variant="success" disabled={pending} className="flex-1"
              onClick={() => run(() => convertLead(leadId), "Converted to customer 🎉")}>
              Convert
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} className="flex-1 text-red-600"
              onClick={() => setLostOpen(true)}>
              Mark Lost
            </Button>
          </>
        )}
      </div>

      <Modal open={lostOpen} onClose={() => setLostOpen(false)} title="Mark Lead as Lost">
        <div className="space-y-3">
          <Field label="Lost Reason">
            <Select value={reason} onChange={e => setReason(e.target.value as LostReason)}>
              {Object.entries(lostReasonLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </Field>
          <Field label="Note (optional)">
            <Input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Competitor offered $2/tire less" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setLostOpen(false)}>Cancel</Button>
            <Button variant="danger" disabled={pending}
              onClick={() => { run(() => markLeadLost(leadId, reason, note), "Lead marked lost"); setLostOpen(false); }}>
              Mark lost
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
