"use client";

import { useState, useTransition } from "react";
import { updateUserPermissions } from "@/actions/permissions";
import { PERMISSIONS, effectivePerm, roleDefault, type PermKey } from "@/lib/permissions";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

/** Checkbox list of module access for one user (ADMIN-only UI). */
export function UserPermissionsButton({ userId, name, role, permissions }: {
  userId: string; name: string; role: string; permissions: string[];
}) {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<string[]>(
    PERMISSIONS.filter(p => effectivePerm({ role, permissions }, p.key as PermKey)).map(p => p.key),
  );
  const [pending, start] = useTransition();
  const toast = useToast();

  const toggle = (key: string) =>
    setChecked(c => (c.includes(key) ? c.filter(k => k !== key) : [...c, key]));

  const save = () => start(async () => {
    const r = await updateUserPermissions(userId, checked);
    if (r.ok) { toast("Permissions saved — effective immediately"); setOpen(false); }
    else toast(r.error ?? "Save failed", "error");
  });

  if (role === "ADMIN") return null; // admins always have everything

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>🔑 Permissions</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Permissions — ${name}`}>
        <p className="mb-3 text-xs text-slate-500">
          Checked = can see and use the module. Unchecking hides it from the sidebar and blocks the pages. Changes apply on their next click — no re-login needed.
        </p>
        <div className="space-y-1.5">
          {PERMISSIONS.map(p => {
            const isDefault = roleDefault(role, p.key as PermKey);
            return (
              <label key={p.key} className="flex items-center gap-2.5 rounded-md border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">
                <input type="checkbox" className="h-4 w-4" checked={checked.includes(p.key)} onChange={() => toggle(p.key)} />
                <span className="flex-1 text-slate-700">{p.label}</span>
                {checked.includes(p.key) !== isDefault && (
                  <span className="text-xs font-medium text-amber-600">custom</span>
                )}
              </label>
            );
          })}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} disabled={pending}>{pending ? "Saving…" : "Save permissions"}</Button>
        </div>
      </Modal>
    </>
  );
}
