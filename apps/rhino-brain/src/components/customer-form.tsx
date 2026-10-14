"use client";

import { useFormState } from "react-dom";
import { createCustomer, updateCustomer } from "@/actions/customers";
import { Input, Select, Textarea, Field } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  customerTypeLabels, customerStatusLabels, customerSourceLabels, productLabels, tierLabels,
} from "@/lib/domain";
import { useToast } from "@/components/ui/toast";
import { useEffect, useRef, useState } from "react";
import { scanBusinessCard } from "@/actions/ai";

/** Shrink a card photo to ≤1600px JPEG before scan/upload. */
async function compressCard(file: File): Promise<File> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, "image/jpeg", 0.85));
    return blob ? new File([blob], "Business-card.jpg", { type: "image/jpeg" }) : file;
  } catch { return file; }
}

export type RepOption = { id: string; name: string };

type CustomerValues = Partial<{
  companyName: string; contactPerson: string; phone: string; contactCell: string; email: string;
  website: string; facebookUrl: string; instagramUrl: string; whatsapp: string; address: string;
  city: string; state: string; zip: string; type: string; status: string; source: string;
  mainInterest: string; tier: string; creditLimit: string; paymentTerms: string;
  nextFollowUpAt: string; notes: string; assignedRepId: string;
}>;

const NEW_DOC_TYPES: [string, string][] = [
  ["ACCOUNT_APPLICATION", "Account Application"],
  ["RESALE_CERTIFICATE", "Resale Certificate"],
  ["DRIVER_LICENSE", "Driver License Copy"],
  ["CREDIT_CARD_AUTH", "Credit Card Authorization"],
  ["W9_FORM", "W-9 Form"],
];

export function CustomerForm({ customerId, values = {}, reps, canAssign, onDone, locations, currentLocationId, storageReady }: {
  customerId?: string;
  values?: CustomerValues;
  reps: RepOption[];
  canAssign: boolean;
  onDone?: () => void;
  locations?: { id: string; name: string; shortTag: string }[];
  currentLocationId?: string | null;
  storageReady?: boolean;
}) {
  const action = customerId ? updateCustomer.bind(null, customerId) : createCustomer;
  const [state, formAction] = useFormState(action, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [cardFile, setCardFile] = useState<File | null>(null);
  const [scanning, setScanning] = useState(false);
  const toast = useToast();

  const scan = async (raw: File) => {
    setScanning(true);
    try {
      const file = await compressCard(raw);
      const fd = new FormData();
      fd.set("photo", file);
      const r = await scanBusinessCard(fd);
      if (r.ok && r.fields && formRef.current) {
        setCardFile(file);
        const x = r.fields as Record<string, string | undefined>;
        const map: Record<string, string | undefined> = {
          companyName: x.companyName, contactPerson: x.contactPerson, phone: x.phone,
          contactCell: x.cell, email: x.email, website: x.website,
          address: x.address, city: x.city, state: x.state, zip: x.zip,
        };
        for (const [name, v] of Object.entries(map)) {
          if (!v) continue;
          const el = formRef.current.elements.namedItem(name);
          if (el instanceof HTMLInputElement) el.value = v;
        }
        toast("Card read ✓ — check the fields, then save (the card photo files itself)");
      } else toast(r.error ?? "Could not read the card", "error");
    } finally { setScanning(false); }
  };

  const submit = (fd: FormData) => {
    if (cardFile) fd.set("doc_OTHER", cardFile);
    formAction(fd);
  };

  useEffect(() => {
    if (state?.ok) { toast(customerId ? "Customer updated" : "Customer created"); onDone?.(); }
    if (state?.error) toast(state.error, "error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form ref={formRef} action={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className={`sm:col-span-2 flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed p-3 text-sm font-semibold ${cardFile ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-brand-300 bg-brand-50 text-brand-700"}`}>
        {scanning ? "🔍 Reading card…" : cardFile ? "📇 Card scanned ✓ — tap to rescan" : "📇 Scan business card (AI fills the form)"}
        <input type="file" accept="image/*" capture="environment" className="hidden" disabled={scanning}
          onChange={e => { const f = e.target.files?.[0]; if (f) scan(f); e.target.value = ""; }} />
      </label>
      {locations && locations.length > 0 && (
        <Field label="Location *" className="sm:col-span-2">
          <Select name="locationId" defaultValue={currentLocationId ?? locations[0].id}>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name} ({l.shortTag})</option>)}
          </Select>
        </Field>
      )}
      <Field label="Company Name *" className="sm:col-span-2">
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
      <Field label="Notes" className="sm:col-span-2">
        <Textarea name="notes" defaultValue={values.notes} />
      </Field>
      {!customerId && storageReady && (
        <div className="space-y-2 rounded-md border border-dashed border-slate-300 p-3 sm:col-span-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">📄 Documents (optional — PDF/image, max 10 MB each)</div>
          {NEW_DOC_TYPES.map(([type, label]) => (
            <div key={type} className="flex items-center gap-3">
              <span className="w-52 shrink-0 text-sm text-slate-600">{label}</span>
              <input name={`doc_${type}`} type="file" accept="application/pdf,image/*"
                className="flex-1 text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-200 file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-300" />
              {type === "RESALE_CERTIFICATE" && (
                <Input name="doc_RESALE_CERTIFICATE_expiry" type="date" className="w-40" title="Certificate expiration date" />
              )}
            </div>
          ))}
        </div>
      )}
      {state?.error && <p className="text-sm text-red-600 sm:col-span-2">{state.error}</p>}
      <div className="flex justify-end sm:col-span-2">
        <SubmitButton>{customerId ? "Save changes" : "Create customer"}</SubmitButton>
      </div>
    </form>
  );
}
