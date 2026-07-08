"use client";

import { useEffect, useState, useTransition } from "react";
import { useFormState } from "react-dom";
import { createTask, completeTask, cancelTask } from "@/actions/tasks";
import { Modal } from "@/components/ui/modal";
import { Button, Input, Select, Textarea, Field } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { useToast } from "@/components/ui/toast";
import { taskPriorityLabels, taskTypeLabels } from "@/lib/domain";
import type { CustomerOption } from "./quick-log";

export function NewTaskButton({ customers, users, canAssign, selfId, defaultCustomerId, label = "New Task" }: {
  customers: CustomerOption[];
  users: { id: string; name: string }[];
  canAssign: boolean;
  selfId: string;
  defaultCustomerId?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useFormState(createTask, null);
  const toast = useToast();

  useEffect(() => {
    if (state?.ok) { toast("Task created"); setOpen(false); }
    if (state?.error) toast(state.error, "error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <>
      <Button onClick={() => setOpen(true)}>{label}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="New Task">
        <form action={action} className="space-y-3">
          <Field label="Title *"><Input name="title" required placeholder="e.g. Call about overdue quote" /></Field>
          <Field label="Description"><Textarea name="description" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Customer">
              <Select name="customerId" defaultValue={defaultCustomerId ?? ""}>
                <option value="">— None —</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
              </Select>
            </Field>
            <Field label="Assign To">
              <Select name="assigneeId" defaultValue={selfId} disabled={!canAssign}>
                {canAssign
                  ? users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)
                  : <option value={selfId}>Me</option>}
              </Select>
            </Field>
            <Field label="Due Date *"><Input name="dueDate" type="date" required /></Field>
            <Field label="Priority">
              <Select name="priority" defaultValue="MEDIUM">
                {Object.entries(taskPriorityLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
            <Field label="Task Type">
              <Select name="type" defaultValue="FOLLOW_UP">
                {Object.entries(taskTypeLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
          </div>
          {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <SubmitButton>Create task</SubmitButton>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function TaskActions({ taskId, status }: { taskId: string; status: string }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  if (status !== "OPEN") return null;
  return (
    <div className="flex gap-1.5">
      <Button size="sm" variant="success" disabled={pending}
        onClick={() => start(async () => { const r = await completeTask(taskId); toast(r.ok ? "Task completed" : r.error!, r.ok ? "success" : "error"); })}>
        Complete
      </Button>
      <Button size="sm" variant="ghost" disabled={pending}
        onClick={() => start(async () => { const r = await cancelTask(taskId); toast(r.ok ? "Task canceled" : r.error!, r.ok ? "success" : "error"); })}>
        Cancel
      </Button>
    </div>
  );
}
