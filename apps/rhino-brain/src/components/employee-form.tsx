"use client";

import { useEffect, useState } from "react";
import { useFormState } from "react-dom";
import { createEmployee, updateEmployee } from "@/actions/hr";
import { Modal } from "@/components/ui/modal";
import { Button, Input, Select, Textarea, Field } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { useToast } from "@/components/ui/toast";

export type EmployeeDTO = {
  id: string; name: string; position: string | null; phone: string | null;
  email: string | null; hireDate: string | null; status: "ACTIVE" | "TERMINATED";
  endDate: string | null; notes: string | null; locationId: string; userId: string | null;
};

type Option = { id: string; name: string };
type LocationOption = { id: string; name: string; shortTag: string };

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
  const toast = useToast();

  useEffect(() => {
    if (state?.ok) { toast(employee ? "Employee updated" : "Employee added"); onDone(); }
    if (state?.error) toast(state.error, "error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : "");

  return (
    <form action={action} className="space-y-3">
      {employee && <input type="hidden" name="employeeId" value={employee.id} />}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Full name *">
          <Input name="name" defaultValue={employee?.name ?? ""} required />
        </Field>
        <Field label="Position">
          <Input name="position" defaultValue={employee?.position ?? ""} placeholder="e.g. Warehouse Associate" />
        </Field>
        <Field label="Phone">
          <Input name="phone" defaultValue={employee?.phone ?? ""} />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" defaultValue={employee?.email ?? ""} />
        </Field>
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
        <Textarea name="notes" rows={2} defaultValue={employee?.notes ?? ""} />
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
