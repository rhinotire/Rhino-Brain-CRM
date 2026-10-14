"use client";

import { useState, useTransition } from "react";
import { createAccountInvite, textAccountInvite } from "@/actions/account-setup";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

export type AccountInviteInfo = { status: "PENDING"; url: string } | { status: "SUBMITTED"; submittedAt: string } | null;

/** Send the customer a link to fill in their own wholesale-account application. */
export function AccountSetupButton({ customerId, invite, smsReady, hasPhone }: {
  customerId: string; invite: AccountInviteInfo; smsReady: boolean; hasPhone: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(invite?.status === "PENDING" ? invite.url : "");
  const [pending, start] = useTransition();
  const toast = useToast();

  const generate = () => start(async () => {
    const r = await createAccountInvite(customerId);
    if (r.ok && r.url) { setUrl(r.url); toast("Link created"); }
    else toast(r.error ?? "Failed", "error");
  });

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast("Link copied ✓"); }
    catch { toast("Could not copy — select the text manually", "error"); }
  };

  const text = () => start(async () => {
    const r = await textAccountInvite(customerId);
    if (r.ok) { toast("Texted to the customer ✓"); setOpen(false); }
    else toast(r.error ?? "Failed", "error");
  });

  return (
    <>
      <Button size="md" variant="secondary" onClick={() => setOpen(true)}>
        {invite?.status === "SUBMITTED" ? "📋 Application ✓" : "📋 Account Form"}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Online Account Application">
        {invite?.status === "SUBMITTED" ? (
          <p className="text-sm text-emerald-700">
            ✅ Submitted {new Date(invite.submittedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} — the info was written into this customer&apos;s record and documents.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              The customer fills in their business info, tax ID and resale certificate on their phone (English + Spanish). Submitting updates this customer record directly and bells the rep. Link valid 14 days.
            </p>
            {url ? (
              <>
                <div className="break-all rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">{url}</div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={copy}>📋 Copy link</Button>
                  {smsReady && hasPhone && (
                    <Button size="sm" variant="success" onClick={text} disabled={pending}>
                      {pending ? "Sending…" : "💬 Text it to the customer"}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={generate} disabled={pending}>↻ New link</Button>
                </div>
              </>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={generate} disabled={pending}>{pending ? "Creating…" : "🔗 Create link"}</Button>
                {smsReady && hasPhone && (
                  <Button size="sm" variant="success" onClick={text} disabled={pending}>
                    {pending ? "Sending…" : "💬 Create & text to customer"}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
