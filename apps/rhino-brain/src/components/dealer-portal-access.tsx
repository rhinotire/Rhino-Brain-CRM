"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createDealerLogin, resetDealerPassword, setDealerActive } from "@/actions/dealer-portal";
import { Button, Input, Badge } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL ?? "https://www.rhinotiresusa.com/dealer/login";

type PortalUser = { id: string; name: string; email: string; active: boolean; lastLoginAt: string | null };

/** Customer profile block: create/reset/disable this customer's portal logins.
 * Temp passwords render once with a copy button — they are never retrievable. */
export function DealerPortalAccess({ customerId, users, defaultName, defaultEmail }: {
  customerId: string;
  users: PortalUser[];
  defaultName: string;
  defaultEmail: string;
}) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  const copyInvite = (pw: string, mail: string) => {
    navigator.clipboard.writeText(
      `Your ${PORTAL_URL.includes("everflow") ? "Everflow" : "Rhino Tire USA"} dealer portal login:\n${PORTAL_URL}\nEmail: ${mail}\nTemporary password: ${pw}\n\nYou can browse your pricing, live stock, and place orders 24/7.`,
    );
    toast("Invite copied — paste into WhatsApp or email");
  };

  return (
    <div className="space-y-3">
      {users.length === 0 && !showForm && (
        <p className="text-sm text-slate-500">No portal login yet — the customer orders by phone/rep only.</p>
      )}

      {users.map((u) => (
        <div key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 px-3 py-2 text-sm">
          <span className="font-semibold">{u.name}</span>
          <span className="text-slate-500">{u.email}</span>
          <Badge className={u.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}>
            {u.active ? "Active" : "Disabled"}
          </Badge>
          <span className="text-xs text-slate-400">
            {u.lastLoginAt ? `last login ${new Date(u.lastLoginAt).toLocaleDateString()}` : "never logged in"}
          </span>
          <span className="ml-auto flex gap-2">
            <Button variant="secondary" size="sm" disabled={pending}
              onClick={() => start(async () => {
                const r = await resetDealerPassword(u.id);
                if (r.ok && r.tempPassword) { setIssued({ email: u.email, password: r.tempPassword }); toast("Password reset"); }
                else toast(r.error ?? "Failed", "error");
              })}>
              Reset password
            </Button>
            <Button variant="secondary" size="sm" disabled={pending}
              onClick={() => start(async () => {
                const r = await setDealerActive(u.id, !u.active);
                if (r.ok) { toast(u.active ? "Login disabled" : "Login re-enabled"); router.refresh(); }
                else toast(r.error ?? "Failed", "error");
              })}>
              {u.active ? "Disable" : "Enable"}
            </Button>
          </span>
        </div>
      ))}

      {issued && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm">
          <p className="font-bold text-amber-900">Temporary password for {issued.email} — visible only now:</p>
          <p className="mt-1 font-mono text-base font-bold tracking-wide">{issued.password}</p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={() => copyInvite(issued.password, issued.email)}>📋 Copy invite message</Button>
            <Button variant="secondary" size="sm" onClick={() => setIssued(null)}>Done</Button>
          </div>
        </div>
      )}

      {showForm ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await createDealerLogin({ customerId, name, email });
              if (r.ok && r.tempPassword) {
                setIssued({ email: email.trim().toLowerCase(), password: r.tempPassword });
                setShowForm(false);
                toast("Portal login created");
                router.refresh();
              } else toast(r.error ?? "Failed", "error");
            });
          }}
        >
          <div>
            <label className="block text-xs font-semibold text-slate-500">Contact name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-44" required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500">Login email</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-60" required />
          </div>
          <Button disabled={pending}>{pending ? "Creating…" : "Create login"}</Button>
          <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
        </form>
      ) : (
        <Button variant="secondary" size="sm" onClick={() => setShowForm(true)}>
          + {users.length ? "Add another login" : "Open portal access"}
        </Button>
      )}

      <p className="text-xs text-slate-400">
        Portal: {PORTAL_URL} — dealers see their tier pricing and live stock, and orders land in Portal Orders.
      </p>
    </div>
  );
}
