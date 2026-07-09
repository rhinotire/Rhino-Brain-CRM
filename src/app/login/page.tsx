"use client";

import { useFormState } from "react-dom";
import { login } from "@/actions/auth";
import { Input, Label, Button } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";

export default function LoginPage() {
  const [state, action] = useFormState(login, null);

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-900 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/rhino-brain-logo.png" alt="Rhino Brain" className="mx-auto h-36 w-36 rounded-2xl shadow-lg" />
          <div className="mt-4 text-3xl font-black tracking-tight text-white">
            RHINO <span className="text-brand-500">BRAIN</span>
          </div>
          <p className="mt-1 text-sm text-slate-400">AI Business Command Center — tire &amp; wheel wholesale</p>
        </div>
        <form action={action} className="space-y-4 rounded-lg bg-white p-6 shadow-xl">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" placeholder="you@company.com" required autoFocus />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" placeholder="••••••••" required />
          </div>
          {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
          <SubmitButton>Sign in</SubmitButton>
        </form>
      </div>
    </main>
  );
}
