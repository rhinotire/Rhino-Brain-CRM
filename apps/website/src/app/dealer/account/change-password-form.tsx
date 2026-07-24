"use client";

import { useState } from "react";
import { changeDealerPassword } from "./account-actions";

export function ChangePasswordForm() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(formData: FormData) {
    const next = String(formData.get("next") ?? "");
    if (next !== String(formData.get("confirm") ?? "")) {
      setMsg({ ok: false, text: "New passwords don't match." });
      return;
    }
    setPending(true);
    const res = await changeDealerPassword(String(formData.get("current") ?? ""), next);
    setPending(false);
    setMsg(res.ok ? { ok: true, text: "Password updated ✓" } : { ok: false, text: res.error ?? "Failed" });
  }

  return (
    <form action={submit} className="mt-3 space-y-3">
      {(["current", "next", "confirm"] as const).map((field) => (
        <div key={field}>
          <label htmlFor={`pw-${field}`} className="block text-xs font-bold uppercase tracking-wide text-steel-500">
            {field === "current" ? "Current password" : field === "next" ? "New password (8+ characters)" : "Confirm new password"}
          </label>
          <input id={`pw-${field}`} name={field} type="password" required minLength={field === "current" ? 1 : 8}
            autoComplete={field === "current" ? "current-password" : "new-password"}
            className="mt-1 w-full rounded-lg border border-steel-300 px-3 py-2 text-sm" />
        </div>
      ))}
      {msg && (
        <p className={`rounded-lg px-3 py-2 text-xs font-semibold ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          {msg.text}
        </p>
      )}
      <button disabled={pending} className="btn-gold w-full">{pending ? "Saving…" : "Update Password"}</button>
    </form>
  );
}
