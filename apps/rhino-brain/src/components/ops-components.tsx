"use client";

import { useEffect, useState, useTransition } from "react";
import { useFormState } from "react-dom";
import { upsertOpsItem, renewOpsItem, deleteOpsItem, createRepairTicket, setRepairStatus } from "@/actions/ops";
import { OPS_CATEGORIES } from "@/lib/ops";
import { Modal } from "@/components/ui/modal";
import { Button, Input, Select, Textarea, Field } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { useToast } from "@/components/ui/toast";

export type OpsItemDTO = {
  id: string; name: string; category: string; asset: string | null;
  dueDate: string; recurrenceMonths: number | null; remindDays: number; notes: string | null;
};

/** Add / edit a renewal item. */
export function OpsItemButton({ item, label }: { item?: OpsItemDTO; label?: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useFormState(upsertOpsItem, null);
  const toast = useToast();

  useEffect(() => {
    if (state?.ok) { toast(item ? "Item updated" : "Item added — reminders are on"); setOpen(false); }
    if (state?.error) toast(state.error, "error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <>
      <Button size="sm" variant={item ? "ghost" : "primary"} onClick={() => setOpen(true)}>
        {label ?? (item ? "Edit" : "➕ Add renewal item")}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={item ? `Edit — ${item.name}` : "New renewal / expiry item"}>
        <form action={action} className="space-y-3">
          {item && <input type="hidden" name="id" value={item.id} />}
          <Field label="What is it? *">
            <Input name="name" required defaultValue={item?.name ?? ""} placeholder="e.g. Box truck FL-123 insurance" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <Select name="category" defaultValue={item?.category ?? "OTHER"}>
                {Object.entries(OPS_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
              </Select>
            </Field>
            <Field label="Vehicle / asset / policy #">
              <Input name="asset" defaultValue={item?.asset ?? ""} placeholder="Ford F-600 · Policy 88213" />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Due / expires *">
              <Input name="dueDate" type="date" required defaultValue={item?.dueDate?.slice(0, 10) ?? ""} />
            </Field>
            <Field label="Repeats every">
              <Select name="recurrenceMonths" defaultValue={String(item?.recurrenceMonths ?? 12)}>
                <option value="">One-time</option>
                <option value="1">Month</option>
                <option value="3">3 months</option>
                <option value="6">6 months</option>
                <option value="12">Year</option>
                <option value="24">2 years</option>
              </Select>
            </Field>
            <Field label="Remind before">
              <Select name="remindDays" defaultValue={String(item?.remindDays ?? 30)}>
                <option value="7">7 days</option>
                <option value="14">14 days</option>
                <option value="30">30 days</option>
                <option value="60">60 days</option>
                <option value="90">90 days</option>
              </Select>
            </Field>
          </div>
          <Field label="Notes">
            <Textarea name="notes" rows={2} defaultValue={item?.notes ?? ""} placeholder="Agent contact, account #, where the paperwork lives…" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <SubmitButton>{item ? "Save" : "Add item"}</SubmitButton>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function RenewButton({ id, recurring }: { id: string; recurring: boolean }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const run = () => start(async () => {
    const r = await renewOpsItem(id);
    if (r.ok) toast(recurring ? "Renewed — rolled to the next cycle ✓" : "Marked done ✓");
    else toast(r.error ?? "Failed", "error");
  });
  return (
    <Button size="sm" variant="success" onClick={run} disabled={pending}>
      {pending ? "…" : recurring ? "✓ Renewed" : "✓ Done"}
    </Button>
  );
}

export function DeleteOpsButton({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const run = () => {
    if (!window.confirm(`Delete "${name}"? Reminders for it stop.`)) return;
    start(async () => {
      const r = await deleteOpsItem(id);
      if (r.ok) toast("Deleted"); else toast(r.error ?? "Failed", "error");
    });
  };
  return <button type="button" onClick={run} disabled={pending} className="text-xs text-slate-400 underline hover:text-red-600">delete</button>;
}

/** Report a warehouse problem (photo optional). */
export function NewRepairButton() {
  const [open, setOpen] = useState(false);
  const [state, action] = useFormState(createRepairTicket, null);
  const toast = useToast();

  useEffect(() => {
    if (state?.ok) { toast("Reported — managers notified"); setOpen(false); }
    if (state?.error) toast(state.error, "error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>🔧 Report a problem</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Report a repair / problem">
        <form action={action} className="space-y-3">
          <Field label="What's broken? *">
            <Input name="title" required placeholder="e.g. Forklift #2 hydraulic leak" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Priority">
              <Select name="priority" defaultValue="NORMAL">
                <option value="LOW">Low — when convenient</option>
                <option value="NORMAL">Normal</option>
                <option value="URGENT">🔴 Urgent — blocking work</option>
              </Select>
            </Field>
            <Field label="Photo (optional)">
              <input name="photo" type="file" accept="image/*"
                className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm" />
            </Field>
          </div>
          <Field label="Details">
            <Textarea name="details" rows={2} placeholder="Where it is, since when, who noticed…" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <SubmitButton>Report</SubmitButton>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function RepairStatusButtons({ id, status, assignee, canManage }: {
  id: string; status: string; assignee: string | null; canManage: boolean;
}) {
  const [pending, start] = useTransition();
  const toast = useToast();
  if (!canManage) return null;
  const move = (next: "IN_PROGRESS" | "DONE" | "OPEN") => start(async () => {
    let who: string | undefined;
    if (next === "IN_PROGRESS") {
      const input = window.prompt("Who's handling it? (person or vendor, optional)", assignee ?? "");
      if (input === null) return;
      who = input;
    }
    const r = await setRepairStatus(id, next, who);
    if (r.ok) toast("Updated"); else toast(r.error ?? "Failed", "error");
  });
  return (
    <span className="flex gap-1.5">
      {status === "OPEN" && <Button size="sm" variant="secondary" disabled={pending} onClick={() => move("IN_PROGRESS")}>▶ Start</Button>}
      {status !== "DONE" && <Button size="sm" variant="success" disabled={pending} onClick={() => move("DONE")}>✓ Done</Button>}
      {status === "DONE" && <Button size="sm" variant="ghost" disabled={pending} onClick={() => move("OPEN")}>↺ Reopen</Button>}
    </span>
  );
}
