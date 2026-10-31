"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { claimCustomer } from "@/actions/customer-pool";

/**
 * Claim a customer out of the 公海 pool. First click wins server-side, so the interesting state
 * here is the refusal: a rep who loses the race, or who has hit the weekly cap, is told why in
 * their own words rather than seeing the row silently stay put.
 */
export function ClaimCustomerButton({ customerId, companyName }: { customerId: string; companyName: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const onClick = () => {
    setError(null);
    startTransition(async () => {
      const res = await claimCustomer(customerId);
      if (res.ok) router.refresh();
      else setError(res.error ?? "Could not claim this customer");
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        aria-label={`Claim ${companyName}`}
        className="inline-flex h-8 items-center rounded-md bg-brand-600 px-3 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {pending ? "Claiming…" : "Claim"}
      </button>
      {error && <span className="max-w-[16rem] text-right text-xs text-red-600">{error}</span>}
    </div>
  );
}
