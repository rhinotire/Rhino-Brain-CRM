"use client";

import { useState, useTransition } from "react";
import { createOnboardingInvite } from "@/actions/onboarding";
import { Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import type { OnboardingData } from "@/lib/onboarding";

export type InviteInfo =
  | { status: "PENDING"; url: string; expiresAt: string }
  | { status: "SUBMITTED"; submittedAt: string; data: OnboardingData | null }
  | null;

/** "Send onboarding form" panel on the employee page: link generator + (admin) submitted data. */
export function OnboardingInvitePanel({ employeeId, invite, isAdmin }: {
  employeeId: string; invite: InviteInfo; isAdmin: boolean;
}) {
  const [url, setUrl] = useState(invite?.status === "PENDING" ? invite.url : "");
  const [showBank, setShowBank] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();

  const generate = () => start(async () => {
    const r = await createOnboardingInvite(employeeId);
    if (r.ok && r.url) { setUrl(r.url); toast("Link created — send it to the employee"); }
    else toast(r.error ?? "Failed", "error");
  });

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast("Link copied ✓"); }
    catch { toast("Could not copy — select and copy manually", "error"); }
  };

  if (invite?.status === "SUBMITTED") {
    const d = invite.data;
    return (
      <div>
        <div className="mb-2 text-sm font-semibold text-emerald-700">✅ Submitted {new Date(invite.submittedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
        {!isAdmin && <p className="text-xs text-slate-500">The submitted details (incl. direct deposit) are visible to the owner only.</p>}
        {isAdmin && d && (
          <dl className="space-y-1.5 text-sm">
            {([
              ["Legal name", d.legalName], ["Phone", d.phone], ["Email", d.email],
              ["Address", [d.address, d.city, d.state, d.zip].filter(Boolean).join(", ")],
              ["Emergency", `${d.ecName}${d.ecRelation ? ` (${d.ecRelation})` : ""} — ${d.ecPhone}`],
              ["Signed", `${d.signature} · ${d.signedAt.slice(0, 10)}`],
            ] as [string, string][]).map(([k, v]) => (
              <div key={k} className="flex gap-3">
                <dt className="w-24 shrink-0 text-slate-400">{k}</dt>
                <dd className="text-slate-700">{v || "—"}</dd>
              </div>
            ))}
            <div className="flex gap-3">
              <dt className="w-24 shrink-0 text-slate-400">Bank</dt>
              <dd className="text-slate-700">
                {showBank ? (
                  <>{d.bankName} · {d.accountType} · routing {d.routingNumber} · account {d.accountNumber}</>
                ) : (
                  <button type="button" className="text-brand-600 underline" onClick={() => setShowBank(true)}>
                    {d.bankName} · •••• show direct deposit details
                  </button>
                )}
              </dd>
            </div>
          </dl>
        )}
      </div>
    );
  }

  return (
    <div>
      <p className="mb-2 text-xs text-slate-500">
        The employee types their own info on their phone — contact, emergency contact, direct deposit (typo-checked) — no handwriting to misread.
      </p>
      {url ? (
        <div className="space-y-2">
          <div className="break-all rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">{url}</div>
          <div className="flex gap-2">
            <Button size="sm" onClick={copy}>📋 Copy link</Button>
            <Button size="sm" variant="secondary" onClick={generate} disabled={pending}>↻ New link</Button>
          </div>
          <p className="text-xs text-slate-400">Valid 7 days. Text it to the employee or open it on their phone.</p>
        </div>
      ) : (
        <Button size="sm" onClick={generate} disabled={pending}>
          {pending ? "Creating…" : "📨 Send onboarding form"}
        </Button>
      )}
    </div>
  );
}
