"use client";

import { useEffect, useState } from "react";
import { useFormState } from "react-dom";
import { createEmployee, updateEmployee } from "@/actions/hr";
import { scanDriverLicense } from "@/actions/ai";

/** Shrink the license photo to ≤1600px JPEG before upload. */
async function compressLicense(file: File): Promise<File> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, "image/jpeg", 0.85));
    return blob ? new File([blob], "license.jpg", { type: "image/jpeg" }) : file;
  } catch { return file; }
}
import { Modal } from "@/components/ui/modal";
import { Button, Input, Select, Textarea, Field } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { useToast } from "@/components/ui/toast";

export type EmployeeDTO = {
  id: string; name: string; position: string | null; phone: string | null;
  email: string | null; hireDate: string | null; status: "ACTIVE" | "TERMINATED";
  endDate: string | null; notes: string | null; locationId: string; userId: string | null;
  dob: string | null; address: string | null; city: string | null; state: string | null;
  zip: string | null; licenseNumber: string | null;
};

type Option = { id: string; name: string };
type LocationOption = { id: string; name: string; shortTag: string };

/** Standard positions (owner's list) — the stored value stays free text, so legacy entries keep working. */
const POSITIONS = [
  "Inside Sales", "Outside Sales", "Office Clerk", "Driver", "Warehouse Worker",
  "Warehouse Manager", "Office Manager", "Accountant", "General Manager", "Other",
];

function EmployeeForm({ employee, locations, users, isAdmin, currentLocationId, onDone }: {
  employee?: EmployeeDTO;
  locations: LocationOption[];
  users: Option[];
  isAdmin: boolean;
  currentLocationId?: string | null;
  onDone: () => void;
}) {
  const [state, action] = useFormState(employee ? updateEmployee : createEmployee, null);
  const [status, setStatus] = useState<"ACTIVE" | "TERMINATED">(employee?.status ?? "ACTIVE");
  const [name, setName] = useState(employee?.name ?? "");
  const [notes, setNotes] = useState(employee?.notes ?? "");
  const [idf, setIdf] = useState({
    dob: employee?.dob?.slice(0, 10) ?? "", address: employee?.address ?? "", city: employee?.city ?? "",
    state: employee?.state ?? "", zip: employee?.zip ?? "", licenseNumber: employee?.licenseNumber ?? "",
  });
  const setId = (k: keyof typeof idf) => (e: React.ChangeEvent<HTMLInputElement>) => setIdf(v => ({ ...v, [k]: e.target.value }));
  const [dlFile, setDlFile] = useState<File | null>(null);
  const [dlExpiry, setDlExpiry] = useState("");
  const [scanning, setScanning] = useState(false);
  const toast = useToast();

  const scanLicense = async (raw: File) => {
    setScanning(true);
    try {
      const file = await compressLicense(raw);
      const fd = new FormData();
      fd.set("photo", file);
      const r = await scanDriverLicense(fd);
      if (r.ok && r.fields) {
        const x = r.fields;
        setDlFile(file);
        if (x.name) setName(x.name);
        if (x.expiration) setDlExpiry(x.expiration);
        setIdf(v => ({
          dob: x.dob ?? v.dob, address: x.address ?? v.address, city: x.city ?? v.city,
          state: x.state ?? v.state, zip: x.zip ?? v.zip, licenseNumber: x.licenseNumber ?? v.licenseNumber,
        }));
        toast("License read ✓ — check the fields, then save (the license photo files itself)");
      } else toast(r.error ?? "Could not read the license", "error");
    } finally { setScanning(false); }
  };

  const submit = (fd: FormData) => {
    if (dlFile) { fd.set("dlPhoto", dlFile); fd.set("dlExpiry", dlExpiry); }
    action(fd);
  };

  useEffect(() => {
    if (state?.ok) { toast(employee ? "Employee updated" : "Employee added"); onDone(); }
    if (state?.error) toast(state.error, "error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : "");

  return (
    <form action={submit} className="space-y-3">
      {employee && <input type="hidden" name="employeeId" value={employee.id} />}
      {!employee && (
        <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed p-3 text-sm font-semibold ${dlFile ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-brand-300 bg-brand-50 text-brand-700"}`}>
          {scanning ? "🔍 Reading license…" : dlFile ? "🪪 License scanned ✓ — tap to rescan" : "🪪 Scan driver license (AI fills name; photo files into the vault)"}
          <input type="file" accept="image/*" capture="environment" className="hidden" disabled={scanning}
            onChange={e => { const f = e.target.files?.[0]; if (f) scanLicense(f); e.target.value = ""; }} />
        </label>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Full name *">
          <Input name="name" value={name} onChange={e => setName(e.target.value)} required />
        </Field>
        <Field label="Position">
          <Select name="position" defaultValue={employee?.position ?? ""}>
            <option value="">— Select —</option>
            {employee?.position && !POSITIONS.includes(employee.position) && (
              <option value={employee.position}>{employee.position}</option>
            )}
            {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
          </Select>
        </Field>
        <Field label="Phone">
          <Input name="phone" defaultValue={employee?.phone ?? ""} />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" defaultValue={employee?.email ?? ""} />
        </Field>
        <Field label="Date of birth">
          <Input name="dob" type="date" value={idf.dob} onChange={setId("dob")} />
        </Field>
        <Field label="Driver license #">
          <Input name="licenseNumber" value={idf.licenseNumber} onChange={setId("licenseNumber")} />
        </Field>
        <Field label="Street address">
          <Input name="address" value={idf.address} onChange={setId("address")} />
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="City">
            <Input name="city" value={idf.city} onChange={setId("city")} />
          </Field>
          <Field label="State">
            <Input name="state" value={idf.state} onChange={setId("state")} />
          </Field>
          <Field label="ZIP">
            <Input name="zip" value={idf.zip} onChange={setId("zip")} />
          </Field>
        </div>
        <Field label="Hire date">
          <Input name="hireDate" type="date" defaultValue={day(employee?.hireDate)} />
        </Field>
        {isAdmin && (
          <Field label="Company / location">
            <Select name="locationId" defaultValue={employee?.locationId ?? currentLocationId ?? ""}>
              <option value="">— choose —</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name} ({l.shortTag})</option>)}
            </Select>
          </Field>
        )}
        <Field label="Status">
          <Select name="status" value={status} onChange={e => setStatus(e.target.value as "ACTIVE" | "TERMINATED")}>
            <option value="ACTIVE">Active</option>
            <option value="TERMINATED">Terminated</option>
          </Select>
        </Field>
        {status === "TERMINATED" && (
          <Field label="End date">
            <Input name="endDate" type="date" defaultValue={day(employee?.endDate)} />
          </Field>
        )}
        <Field label="CRM login (optional)">
          <Select name="userId" defaultValue={employee?.userId ?? ""}>
            <option value="">— none —</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Notes">
        <Textarea name="notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
      </Field>
      {state?.error && <p className="text-xs text-red-600">{state.error}</p>}
      <SubmitButton>{employee ? "Save changes" : "Add employee"}</SubmitButton>
    </form>
  );
}

export function NewEmployeeButton(props: {
  locations: LocationOption[]; users: Option[]; isAdmin: boolean; currentLocationId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>+ New Employee</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="New Employee" wide>
        <EmployeeForm {...props} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}

export function EditEmployeeButton(props: {
  employee: EmployeeDTO; locations: LocationOption[]; users: Option[]; isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>Edit</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Edit Employee" wide>
        <EmployeeForm {...props} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}
