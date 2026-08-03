"use client";

import { useEffect, useState } from "react";
import { useFormState } from "react-dom";
import { uploadEmployeeDocument, getEmployeeDocumentUrl, deleteEmployeeDocument } from "@/actions/hr";
import { employeeDocTypeLabels, EXPIRING_EMPLOYEE_DOC_TYPES, CORE_EMPLOYEE_DOC_TYPES } from "@/lib/domain";
import { Badge, Input, Select, Field } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { useToast } from "@/components/ui/toast";
import type { EmployeeDocType } from "@prisma/client";

export type EmployeeDocRow = {
  id: string; type: string; fileName: string; expiresAt: string | null;
  sensitive: boolean; createdAt: string; uploadedBy: string;
};

const DOC_TYPES = Object.entries(employeeDocTypeLabels) as [EmployeeDocType, string][];
const DAY_MS = 24 * 60 * 60 * 1000;

export function EmployeeDocuments({ employeeId, docs, isAdmin, storageReady }: {
  employeeId: string; docs: EmployeeDocRow[]; isAdmin: boolean; storageReady: boolean;
}) {
  const [state, action] = useFormState(uploadEmployeeDocument, null);
  const [docType, setDocType] = useState<EmployeeDocType>("APPLICATION");
  const toast = useToast();

  useEffect(() => {
    if (state?.ok) toast("Document uploaded");
    if (state?.error) toast(state.error, "error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const now = Date.now();
  const expiry = (iso: string | null) => {
    if (!iso) return "ok";
    const t = new Date(iso).getTime();
    if (t < now) return "expired";
    if (t - now <= 30 * DAY_MS) return "expiring";
    return "ok";
  };

  const statusOf = (type: string) => {
    const ofType = docs.filter(d => d.type === type);
    if (ofType.length === 0) return { label: "Missing", cls: "bg-slate-100 text-slate-500" };
    if (ofType.every(d => expiry(d.expiresAt) === "expired")) return { label: "Expired", cls: "bg-red-100 text-red-700" };
    if (ofType.some(d => expiry(d.expiresAt) === "expiring")) return { label: "Expiring soon", cls: "bg-amber-100 text-amber-700" };
    return { label: "On file", cls: "bg-emerald-100 text-emerald-700" };
  };

  const onFile = CORE_EMPLOYEE_DOC_TYPES.filter(t =>
    docs.some(d => d.type === t && expiry(d.expiresAt) !== "expired")
  ).length;

  const download = async (id: string) => {
    const res = await getEmployeeDocumentUrl(id);
    if (res.url) window.open(res.url, "_blank");
    else toast(res.error ?? "Download failed", "error");
  };
  const remove = async (id: string) => {
    if (!confirm("Delete this document?")) return;
    const res = await deleteEmployeeDocument(id);
    if (res.ok) toast("Document deleted");
    else toast(res.error ?? "Delete failed", "error");
  };

  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-slate-500">{onFile}/{CORE_EMPLOYEE_DOC_TYPES.length} core documents on file</div>
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
                  <span className="truncate">
                    {d.fileName}
                    {d.expiresAt && ` · expires ${new Date(d.expiresAt).toLocaleDateString("en-US")}`}
                  </span>
                  <span className="flex shrink-0 gap-2">
                    {(!d.sensitive || isAdmin)
                      ? <button type="button" onClick={() => download(d.id)} className="text-brand-600 hover:underline">Download</button>
                      : <span className="text-slate-400">admin only</span>}
                    {isAdmin && <button type="button" onClick={() => remove(d.id)} className="text-red-500 hover:underline">Delete</button>}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {storageReady ? (
        <form action={action} className="space-y-2 rounded-md border border-dashed border-slate-300 p-3">
          <input type="hidden" name="employeeId" value={employeeId} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Document type">
              <Select name="type" value={docType} onChange={e => setDocType(e.target.value as EmployeeDocType)}>
                {DOC_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
            {EXPIRING_EMPLOYEE_DOC_TYPES.includes(docType) && (
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
