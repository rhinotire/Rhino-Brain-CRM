"use client";

import { useEffect, useState, useTransition } from "react";
import { useFormState } from "react-dom";
import { sendCustomerText, draftCollectionText } from "@/actions/sms";
import { Modal } from "@/components/ui/modal";
import { Button, Textarea } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { useToast } from "@/components/ui/toast";

/** "💬 Text" button + modal — sends a real SMS from the company's number. */
export function SendTextButton({ customerId, enabled, label = "💬 Text", size = "sm", variant = "secondary" }: {
  customerId: string;
  enabled: boolean;
  label?: string;
  size?: "sm" | "md";
  variant?: "primary" | "secondary" | "ghost" | "success";
}) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [state, action] = useFormState(sendCustomerText, null);
  const [drafting, startDraft] = useTransition();
  const toast = useToast();

  useEffect(() => {
    if (state?.ok) { toast("Text sent ✓ — logged on the customer"); setOpen(false); setBody(""); }
    if (state?.error) toast(state.error, "error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (!enabled) return null;

  const loadCollectionDraft = () => startDraft(async () => {
    const r = await draftCollectionText(customerId);
    if (r.ok && r.text) setBody(r.text);
    else toast(r.error ?? "Could not build the draft", "error");
  });

  const segments = body.length <= 160 ? 1 : Math.ceil(body.length / 153);

  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)}>{label}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Send Text Message">
        <form action={action} className="space-y-3">
          <input type="hidden" name="customerId" value={customerId} />
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={loadCollectionDraft} disabled={drafting}
              className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-600 hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-50">
              {drafting ? "Building…" : "💰 Payment reminder (with invoice detail)"}
            </button>
            <button type="button" onClick={() => setBody("Hi! Just checking in — anything you need this week? We have fresh stock in. ")}
              className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-600 hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700">
              👋 Check-in
            </button>
          </div>
          <Textarea name="body" required rows={5} value={body} onChange={e => setBody(e.target.value)}
            placeholder="Type the message the customer will receive…" maxLength={1200} />
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>{body.length} chars · {segments} segment{segments > 1 ? "s" : ""}</span>
            <span>Replies land on the customer page + your notifications</span>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <SubmitButton>Send text</SubmitButton>
          </div>
        </form>
      </Modal>
    </>
  );
}
