"use client";

import { useEffect, useState, useTransition } from "react";
import { useFormState } from "react-dom";
import { upsertUser, toggleUserActive } from "@/actions/quotes";
import { Modal } from "@/components/ui/modal";
import { Button, Input, Select, Field } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { useToast } from "@/components/ui/toast";
import { roleLabels } from "@/lib/domain";

type UserRow = { id: string; name: string; email: string; role: string; active: boolean; locationId?: string | null; assistIds?: string[] };

export function UserFormButton({ user, locations, reps }: { user?: UserRow; locations?: { id: string; name: string; shortTag: string }[]; reps?: { id: string; name: string; role: string }[] }) {
  const [open, setOpen] = useState(false);
  const bound = upsertUser.bind(null, user?.id ?? null);
  const [state, action] = useFormState(bound, null);
  const toast = useToast();

  useEffect(() => {
    if (state?.ok) { toast(user ? "User updated" : "User created"); setOpen(false); }
    if (state?.error) toast(state.error, "error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <>
      <Button variant={user ? "ghost" : "primary"} size={user ? "sm" : "md"} onClick={() => setOpen(true)}>
        {user ? "Edit" : "+ Add User"}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={user ? `Edit ${user.name}` : "Add User"}>
        <form action={action} className="space-y-3">
          <Field label="Name *"><Input name="name" defaultValue={user?.name} required /></Field>
          <Field label="Email *"><Input name="email" type="email" defaultValue={user?.email} required /></Field>
          <Field label="Role">
            <Select name="role" defaultValue={user?.role ?? "SALES_REP"}>
              {Object.entries(roleLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </Field>
          {locations && locations.length > 0 && (
            <Field label="Location (managers & reps)">
              <Select name="locationId" defaultValue={user?.locationId ?? locations[0].id}>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name} ({l.shortTag})</option>)}
              </Select>
            </Field>
          )}
          {reps && reps.filter(r => r.id !== user?.id).length > 0 && (
            <Field label="Assists (also sees these reps' customers)">
              <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 p-2 space-y-1">
                {reps.filter(r => r.id !== user?.id).map(r => (
                  <label key={r.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="assists" value={r.id} defaultChecked={user?.assistIds?.includes(r.id)} className="rounded" />
                    <span>{r.name}{r.role !== "SALES_REP" ? ` (${roleLabels[r.role as keyof typeof roleLabels] ?? r.role})` : ""}</span>
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-slate-500">This rep will see and manage the selected people&apos;s customers too. They must log out and back in for changes to take effect.</p>
            </Field>
          )}
          <Field label={user ? "New Password (leave blank to keep current)" : "Password *"}>
            <Input name="password" type="password" minLength={8} required={!user} placeholder="Min 8 characters" />
          </Field>
          {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <SubmitButton>{user ? "Save" : "Create user"}</SubmitButton>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function ToggleActiveButton({ userId, active }: { userId: string; active: boolean }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <Button size="sm" variant={active ? "ghost" : "secondary"} disabled={pending}
      className={active ? "text-red-600" : ""}
      onClick={() => start(async () => {
        const r = await toggleUserActive(userId);
        toast(r.ok ? (active ? "User deactivated" : "User reactivated") : r.error!, r.ok ? "success" : "error");
      })}>
      {active ? "Deactivate" : "Reactivate"}
    </Button>
  );
}
