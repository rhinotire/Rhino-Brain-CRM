"use client";

import { useEffect, useState } from "react";
import { useFormState } from "react-dom";
import { uploadCustomerDocument, getDocumentDownloadUrl, deleteCustomerDocument } from "@/actions/documents";
import { Badge, Button, Input, Select, Field } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { useToast } from "@/components/ui/toast";

export type DocRow = {
  id: string; type: string; fileName: string; expiresAt: string | null;
  sensitive: boolean; createdAt: string; uploadedBy: string;
};

const DOC_TYPES: [string, string][] = [
  ["ACCOUNT_APPLICATION", "Account Application"],
  ["RESALE_CERTIFICATE", "Resale Certificate"],
  ["DRIVER_LICENSE", "Driver License Copy"],
  ["CREDIT_CARD_AUTH", "Credit Card Authorization"],
  ["W9_FORM", "W-9 Form"],
  ["INSURANCE_CERT", "Insurance Certificate"],
  ["OTHER", "Other"],
];
const CORE_TYPES = DOC_TYPES.slice(0, 5).map(([v]) => v);

export function CustomerDocuments({ customerId, docs, isManager, storageReady }: {
  customerId: string; docs: DocRow[]; isManager: boolean; storageReady: boolean;
}) {
  const [state, action] = useFormState(uploadCustomerDocument, null);
  const [docType, setDocType] = useState("ACCOUNT_APPLICATION");
  const toast = useToast();

  useEffect(() => {
    if (state?.ok) toast("Document uploaded");
    if (state?.error) toast(state.error, "error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const now = new Date();
  const statusOf = (type: string) => {
    const ofType = docs.filter(d => d.type === type);
    if (ofType.length === 0) return { label: "Missing", cls: "bg-slate-100 text-slate-500" };
    const expired = ofType.every(d => d.expiresAt && new Date(d.expiresAt) < now);
    if (expired) return { label: "Expired", cls: "bg-red-100 text-red-700" };
    return { label: "On file", cls: "bg-emerald-100 text-emerald-700" };
  };
  const onFile = CORE_TYPES.filter(t => docs.some(d => d.type === t && !(d.expiresAt && new Date(d.expiresAt) < now))).length;

  const download = async (id: string) => {
    const res = await getDocumentDownloadUrl(id);
    if (res.url) window.open(res.url, "_blank");
    else toast(res.error ?? "Download failed", "error");
  };
  const remove = async (id: string) => {
    if (!confirm("Delete this document?")) return;
    const res = await deleteCustomerDocument(id);
    if (res.ok) toast("Document deleted");
    else toast(res.error ?? "Delete failed", "error");
  };

  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-slate-500">{onFile}/5 core documents on file</div>
      <div className="space-y-1.5">
        {DOC_TYPES.map(([value, label]) => {
          const st = statusOf(value);
          const ofType = docs.filter(d => d.type === value);
          return (
            <div key={value} className="rounded-md border border-slate-100 px-3 py-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-700">{label}</span>
                <Badge className={st.cls}>{st.label}</Badge>
              </div>
              {ofType.map(d => (
                <div key={d.id} className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-500">
                  <span className="truncate">{d.fileName}{d.expiresAt && ` · expires ${new Date(d.expiresAt).toLocaleDateString("en-US")}`}</span>
                  <span className="flex shrink-0 gap-2">
                    {(!d.sensitive || isManager) && (
                      <button type="button" onClick={() => download(d.id)} className="text-brand-600 hover:underline">Download</button>
                    )}
                    {d.sensitive && !isManager && <span className="text-slate-400">restricted</span>}
                    {isManager && <button type="button" onClick={() => remove(d.id)} className="text-red-500 hover:underline">Delete</button>}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {storageReady ? (
        <form action={action} className="space-y-2 rounded-md border border-dashed border-slate-300 p-3">
          <input type="hidden" name="customerId" value={customerId} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Document type">
              <Select name="type" value={docType} onChange={e => setDocType(e.target.value)}>
                {DOC_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
            {docType === "RESALE_CERTIFICATE" && (
              <Field label="Expiration date">
                <Input name="expiresAt" type="date" />
              </Field>
            )}
          </div>
          <Field label="File (PDF / image, max 10 MB)">
            <input name="file" type="file" accept="application/pdf,image/*" required
              className="w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-600 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-brand-700" />
          </Field>
          {state?.error && <p className="text-xs text-red-600">{state.error}</p>}
          <SubmitButton>⬆ Upload document</SubmitButton>
        </form>
      ) : (
        <div className="rounded-md border border-dashed border-amber-300 bg-amber-50 p-3 text-xs text-amber-700">
          Document storage is not configured yet. Admin: add <code>SUPABASE_URL</code> and <code>SUPABASE_SERVICE_ROLE_KEY</code> to the environment to enable uploads.
        </div>
      )}
    </div>
  );
}
