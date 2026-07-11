"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { installerAccept, installerDecline, installerRequestPrice } from "@/app/send-to-installer/actions";

/** Accept / decline / request-price buttons on the installer's secure page. */
export function ShopRequestActions({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [priceRequested, setPriceRequested] = useState(false);
  const router = useRouter();

  const run = (fn: (t: string) => Promise<{ ok: boolean }>, after?: () => void) =>
    start(async () => {
      const r = await fn(token);
      if (r.ok) (after ?? (() => router.refresh()))();
      else router.refresh();
    });

  return (
    <div className="mt-6 flex flex-wrap gap-2">
      <button
        disabled={pending}
        onClick={() => run(installerAccept)}
        className="rounded-lg bg-brand px-5 py-3 text-sm font-bold text-ink disabled:opacity-60"
      >
        ✓ Accept This Customer
      </button>
      <button
        disabled={pending || priceRequested}
        onClick={() => run(installerRequestPrice, () => setPriceRequested(true))}
        className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-bold disabled:opacity-60"
      >
        {priceRequested ? "✓ Our team will call you" : "Request Wholesale Price"}
      </button>
      <button
        disabled={pending}
        onClick={() => { if (confirm("Decline this customer request?")) run(installerDecline); }}
        className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-500 disabled:opacity-60"
      >
        Decline
      </button>
    </div>
  );
}
