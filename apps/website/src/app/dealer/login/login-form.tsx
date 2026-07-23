"use client";

import { useFormState, useFormStatus } from "react-dom";
import { dealerLogin, type DealerLoginState } from "./dealer-actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-gold w-full" disabled={pending}>
      {pending ? "Signing in…" : "Sign In"}
    </button>
  );
}

export function DealerLoginForm() {
  const [state, action] = useFormState<DealerLoginState, FormData>(dealerLogin, {});
  return (
    <form action={action} className="mx-auto mt-7 max-w-sm space-y-3 text-left">
      <div>
        <label htmlFor="dl-email" className="text-xs font-bold uppercase tracking-wide text-steel-500">Email</label>
        <input id="dl-email" name="email" type="email" autoComplete="email" required
          className="mt-1 w-full rounded-lg border border-steel-300 px-3 py-2.5 text-sm" />
      </div>
      <div>
        <label htmlFor="dl-pass" className="text-xs font-bold uppercase tracking-wide text-steel-500">Password</label>
        <input id="dl-pass" name="password" type="password" autoComplete="current-password" required
          className="mt-1 w-full rounded-lg border border-steel-300 px-3 py-2.5 text-sm" />
      </div>
      {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{state.error}</p>}
      <SubmitButton />
    </form>
  );
}
