"use client";

import { useState, useTransition } from "react";
import { createBlankAccountInvite } from "@/actions/account-setup";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

/** Blank application link: send it before the customer exists — submitting creates the record. */
export function BlankAccountInviteButton() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();

  const generate = () => start(async () => {
    const r = await createBlankAccountInvite();
    if (r.ok && r.url) { setUrl(r.url); toast("Link created — send it to the prospect"); }
    else toast(r.error ?? "Failed", "error");
  });

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast("Link copied ✓"); }
    catch { toast("Could not copy — select the text manually", "error"); }
  };

  return (
    <>
      <Button variant="secondary" onClick={() => { setOpen(true); if (!url) generate(); }}>📋 Account Form Link</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="New-Customer Application Link">
        <p className="mb-3 text-xs text-slate-500">
          Send this to a prospect before they exist in the system — when they submit (business info, tax ID, resale certificate, EN/ES), the customer record is <b>created automatically</b> and assigned to you. If the business name already exists, the submission merges into that customer. Valid 14 days; each link is single-use.
        </p>
        {url ? (
          <div className="space-y-2">
            <div className="break-all rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">{url}</div>
            <div className="flex gap-2">
              <Button size="sm" onClick={copy}>📋 Copy link</Button>
              <Button size="sm" variant="ghost" onClick={generate} disabled={pending}>↻ New link</Button>
            </div>
          </div>
        ) : (
          <Button size="sm" onClick={generate} disabled={pending}>{pending ? "Creating…" : "🔗 Create link"}</Button>
        )}
      </Modal>
    </>
  );
}
