"use client";

import { useFormState } from "react-dom";
import { createCustomer, updateCustomer } from "@/actions/customers";
import { Input, Select, Textarea, Field } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  customerTypeLabels, customerStatusLabels, customerSourceLabels, productLabels, tierLabels,
} from "@/lib/domain";
import { useToast } from "@/components/ui/toast";
import { useEffect } from "react";

export type RepOption = { id: string; name: string };

type CustomerValues = Partial<{
  companyName: string; contactPerson: string; phone: string; contactCell: string; email: string;
  website: string; facebookUrl: string; instagramUrl: string; whatsapp: string; address: string;
  city: string; state: string; zip: string; type: string; status: string; source: string;
  mainInterest: string; tier: string; creditLimit: string; paymentTerms: string;
  nextFollowUpAt: string; notes: string; assignedRepId: string;
}>;

export function CustomerForm({ customerId, values = {}, reps, canAssign, onDone, locations, currentLocationId }: {
  customerId?: string;
  values?: CustomerValues;
  reps: RepOption[];
  canAssign: boolean;
  onDone?: () => void;
  locations?: { id: string; name: string; shortTag: string }[];
  currentLocationId?: string | null;
}) {
  const action = customerId ? updateCustomer.bind(null, customerId) : createCustomer;
  const [state, formAction] = useFormState(action, null);
  const toast = useToast();

  useEffect(() => {
    if (state?.ok) { toast(customerId ? "Customer updated" : "Customer created"); onDone?.(); }
    if (state?.error) toast(state.error, "error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="grid grid-cols-2 gap-3">
      {locations && locations.length > 0 && (
        <Field label="Location *" className="col-span-2">
          <Select name="locationId" defaultValue={currentLocationId ?? locations[0].id}>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name} ({l.shortTag})</option>)}
          </Select>
        </Field>
      )}
      <Field label="Company Name *" className="col-span-2">
        <Input name="companyName" defaultValue={values.companyName} required />
      </Field>
      <Field label="Contact Person"><Input name="contactPerson" defaultValue={values.contactPerson} /></Field>
      <Field label="Company Phone"><Input name="phone" defaultValue={values.phone} /></Field>
      <Field label="Contact Cell"><Input name="contactCell" defaultValue={values.contactCell} /></Field>
      <Field label="Email"><Input name="email" type="email" defaultValue={values.email} /></Field>
      <Field label="Website"><Input name="website" placeholder="https://…" defaultValue={values.website} /></Field>
      <Field label="WhatsApp"><Input name="whatsapp" defaultValue={values.whatsapp} /></Field>
      <Field label="Facebook"><Input name="facebookUrl" placeholder="https://facebook.com/…" defaultValue={values.facebookUrl} /></Field>
      <Field label="Instagram"><Input name="instagramUrl" placeholder="https://instagram.com/…" defaultValue={values.instagramUrl} /></Field>
      <Field label="Address"><Input name="address" defaultValue={values.address} /></Field>
      <Field label="City"><Input name="city" defaultValue={values.city} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="State"><Input name="state" defaultValue={values.state} maxLength={2} placeholder="FL" /></Field>
        <Field label="ZIP"><Input name="zip" defaultValue={values.zip} /></Field>
      </div>
      <Field label="Customer Type">
        <Select name="type" defaultValue={values.type ?? "TIRE_SHOP"}>
          {Object.entries(customerTypeLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
      </Field>
      <Field label="Status">
        <Select name="status" defaultValue={values.status ?? "LEAD"}>
          {Object.entries(customerStatusLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
      </Field>
      <Field label="Source">
        <Select name="source" defaultValue={values.source ?? "OTHER"}>
          {Object.entries(customerSourceLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
      </Field>
      <Field label="Main Product Interest">
        <Select name="mainInterest" defaultValue={values.mainInterest ?? "PCR_TIRES"}>
          {Object.entries(productLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
      </Field>
      <Field label="Price Tier">
        <Select name="tier" defaultValue={values.tier ?? "C"}>
          {Object.entries(tierLabels).map(([v, l]) => <option key={v} value={v}>Tier {l}</option>)}
        </Select>
      </Field>
      <Field label="Credit Limit ($)"><Input name="creditLimit" type="number" min={0} step="100" defaultValue={values.creditLimit} /></Field>
      <Field label="Payment Terms"><Input name="paymentTerms" placeholder="Net 30 / COD…" defaultValue={values.paymentTerms} /></Field>
      <Field label="Next Follow-up"><Input name="nextFollowUpAt" type="date" defaultValue={values.nextFollowUpAt} /></Field>
      {canAssign && (
        <Field label="Assigned Rep">
          <Select name="assignedRepId" defaultValue={values.assignedRepId ?? ""}>
            <option value="">Unassigned</option>
            {reps.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </Field>
      )}
      <Field label="Notes" className="col-span-2">
        <Textarea name="notes" defaultValue={values.notes} />
      </Field>
      {state?.error && <p className="col-span-2 text-sm text-red-600">{state.error}</p>}
      <div className="col-span-2 flex justify-end">
        <SubmitButton>{customerId ? "Save changes" : "Create customer"}</SubmitButton>
      </div>
    </form>
  );
}
