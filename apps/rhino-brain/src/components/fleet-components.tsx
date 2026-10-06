"use client";

import { useEffect, useState } from "react";
import { useFormState } from "react-dom";
import { upsertVehicle, addMaintenance, addIncident, updateClaim } from "@/actions/fleet";
import { Modal } from "@/components/ui/modal";
import { Button, Input, Select, Textarea, Field } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { useToast } from "@/components/ui/toast";

export const MAINT_TYPES: Record<string, string> = {
  OIL_CHANGE: "🛢 Oil change", TIRES: "🛞 Tires", BRAKES: "🛑 Brakes",
  INSPECTION: "🔍 Inspection", REPAIR: "🔧 Repair", OTHER: "📌 Other",
};

export type VehicleDTO = {
  id: string; name: string; plate: string | null; vin: string | null; makeModel: string | null;
  assignedTo: string | null; odometer: number | null; active: boolean; notes: string | null;
};

function useDone(state: { ok?: boolean; error?: string } | null, msg: string, close: () => void) {
  const toast = useToast();
  useEffect(() => {
    if (state?.ok) { toast(msg); close(); }
    if (state?.error) toast(state.error, "error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}

export function VehicleButton({ vehicle }: { vehicle?: VehicleDTO }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useFormState(upsertVehicle, null);
  useDone(state, vehicle ? "Vehicle updated" : "Vehicle added", () => setOpen(false));
  return (
    <>
      <Button size="sm" variant={vehicle ? "secondary" : "primary"} onClick={() => setOpen(true)}>
        {vehicle ? "Edit" : "➕ Add vehicle"}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={vehicle ? `Edit — ${vehicle.name}` : "New vehicle"}>
        <form action={action} className="space-y-3">
          {vehicle && <input type="hidden" name="id" value={vehicle.id} />}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name *"><Input name="name" required defaultValue={vehicle?.name ?? ""} placeholder="Box Truck #1" /></Field>
            <Field label="Make / model / year"><Input name="makeModel" defaultValue={vehicle?.makeModel ?? ""} placeholder="Ford F-600 2019" /></Field>
            <Field label="Plate"><Input name="plate" defaultValue={vehicle?.plate ?? ""} /></Field>
            <Field label="VIN"><Input name="vin" defaultValue={vehicle?.vin ?? ""} /></Field>
            <Field label="Current driver"><Input name="assignedTo" defaultValue={vehicle?.assignedTo ?? ""} /></Field>
            <Field label="Odometer (mi)"><Input name="odometer" inputMode="numeric" defaultValue={vehicle?.odometer ?? ""} /></Field>
          </div>
          <Field label="Notes"><Textarea name="notes" rows={2} defaultValue={vehicle?.notes ?? ""} /></Field>
          {vehicle && (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" name="active" defaultChecked={vehicle.active} value="on" /> Active (uncheck when sold / retired)
            </label>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <SubmitButton>{vehicle ? "Save" : "Add vehicle"}</SubmitButton>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function MaintenanceButton({ vehicleId }: { vehicleId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useFormState(addMaintenance, null);
  useDone(state, "Maintenance logged", () => setOpen(false));
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>🔧 Log maintenance</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Log maintenance / service">
        <form action={action} className="space-y-3">
          <input type="hidden" name="vehicleId" value={vehicleId} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date *"><Input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></Field>
            <Field label="Type">
              <Select name="type" defaultValue="REPAIR">
                {Object.entries(MAINT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="Odometer (mi)"><Input name="odometer" inputMode="numeric" /></Field>
            <Field label="Cost $"><Input name="cost" type="number" min={0} step="0.01" /></Field>
          </div>
          <Field label="Shop / vendor"><Input name="vendor" placeholder="Joe's Truck Service" /></Field>
          <Field label="Notes"><Textarea name="notes" rows={2} placeholder="What was done, parts replaced…" /></Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <SubmitButton>Log it</SubmitButton>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function IncidentButton({ vehicleId }: { vehicleId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useFormState(addIncident, null);
  useDone(state, "Incident recorded — admins notified", () => setOpen(false));
  return (
    <>
      <Button size="sm" variant="danger" onClick={() => setOpen(true)}>🚨 Report incident</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Report accident / incident">
        <form action={action} className="space-y-3">
          <input type="hidden" name="vehicleId" value={vehicleId} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date *"><Input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></Field>
            <Field label="Driver"><Input name="driver" /></Field>
          </div>
          <Field label="What happened? *"><Textarea name="description" rows={3} required placeholder="Where, what, any injuries, other party info…" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Police report #"><Input name="policeReport" /></Field>
            <Field label="Photo (optional)">
              <input name="photo" type="file" accept="image/*"
                className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm" />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <SubmitButton>Record incident</SubmitButton>
          </div>
        </form>
      </Modal>
    </>
  );
}

export type IncidentDTO = {
  id: string; status: string; claimNumber: string | null; insurer: string | null;
  claimAmount: string | null; claimStatus: string | null; notes: string | null;
};

export function ClaimButton({ incident }: { incident: IncidentDTO }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useFormState(updateClaim, null);
  useDone(state, "Claim updated", () => setOpen(false));
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>💼 Claim / status</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Insurance claim & status">
        <form action={action} className="space-y-3">
          <input type="hidden" name="incidentId" value={incident.id} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Incident status">
              <Select name="status" defaultValue={incident.status}>
                <option value="OPEN">Open — not filed yet</option>
                <option value="CLAIM_FILED">Claim filed</option>
                <option value="RESOLVED">Resolved / closed</option>
              </Select>
            </Field>
            <Field label="Claim status">
              <Select name="claimStatus" defaultValue={incident.claimStatus ?? ""}>
                <option value="">—</option>
                <option value="FILED">Filed — waiting</option>
                <option value="APPROVED">Approved</option>
                <option value="PAID">Paid</option>
                <option value="DENIED">Denied</option>
              </Select>
            </Field>
            <Field label="Claim #"><Input name="claimNumber" defaultValue={incident.claimNumber ?? ""} /></Field>
            <Field label="Insurer"><Input name="insurer" defaultValue={incident.insurer ?? ""} placeholder="Progressive Commercial…" /></Field>
            <Field label="Claim amount $"><Input name="claimAmount" type="number" min={0} step="0.01" defaultValue={incident.claimAmount ?? ""} /></Field>
          </div>
          <Field label="Notes"><Textarea name="notes" rows={2} defaultValue={incident.notes ?? ""} placeholder="Adjuster name, phone, next step…" /></Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <SubmitButton>Save</SubmitButton>
          </div>
        </form>
      </Modal>
    </>
  );
}
