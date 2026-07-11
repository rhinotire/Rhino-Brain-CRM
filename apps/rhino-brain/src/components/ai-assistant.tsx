"use client";

import { useFormState, useFormStatus } from "react-dom";
import { draftMessage, askBrain } from "@/actions/ai";
import { Button, Input, Select, Textarea, Field, Card } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";

export type CustomerOpt = { id: string; companyName: string };

function Working({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "🤖 Thinking…" : label}</Button>;
}

export function MessageGenerator({ customers }: { customers: CustomerOpt[] }) {
  const [state, action] = useFormState(draftMessage, null);
  const toast = useToast();
  const copy = (text: string) => { navigator.clipboard.writeText(text); toast("Copied to clipboard"); };

  return (
    <Card title="✉️ Message Generator — AI drafts the follow-up, you hit send">
      <form action={action} className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Customer">
            <>
              <Input name="customerName" list="ai-cust-list" placeholder="Start typing a customer name…"
                onChange={e => {
                  const opt = document.querySelector<HTMLOptionElement>(`#ai-cust-list option[value="${CSS.escape(e.target.value)}"]`);
                  const hidden = document.getElementById("ai-cust-id") as HTMLInputElement | null;
                  if (hidden) hidden.value = opt?.dataset.id ?? "";
                }} />
              <datalist id="ai-cust-list">
                {customers.map(c => <option key={c.id} value={c.companyName} data-id={c.id} />)}
              </datalist>
              <input type="hidden" name="customerId" id="ai-cust-id" />
            </>
          </Field>
          <Field label="Scenario">
            <Select name="scenario" defaultValue="quote_follow_up">
              <option value="quote_follow_up">Quote follow-up</option>
              <option value="reactivation">Win back a quiet customer</option>
              <option value="first_touch">First introduction</option>
              <option value="restock">Restock suggestion</option>
              <option value="new_arrival">Item back in stock</option>
              <option value="payment_reminder">Payment reminder</option>
            </Select>
          </Field>
        </div>
        <Field label="Extra context (optional)">
          <Input name="extra" placeholder="e.g. they asked about ST205/75R15 pricing last week" />
        </Field>
        <Working label="✨ Draft message" />
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      </form>

      {state?.ok && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-slate-500">Email</span>
              <button type="button" onClick={() => copy(state.email ?? "")} className="text-xs text-brand-600 hover:underline">Copy</button>
            </div>
            <pre className="whitespace-pre-wrap font-sans text-sm text-slate-700">{state.email}</pre>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-slate-500">Text / WhatsApp</span>
              <button type="button" onClick={() => copy(state.sms ?? "")} className="text-xs text-brand-600 hover:underline">Copy</button>
            </div>
            <pre className="whitespace-pre-wrap font-sans text-sm text-slate-700">{state.sms}</pre>
          </div>
        </div>
      )}
    </Card>
  );
}

export function AskBox() {
  const [state, action] = useFormState(askBrain, null);
  return (
    <Card title="💬 Ask Rhino Brain — questions about your business, in English or 中文">
      <form action={action} className="space-y-3">
        <Textarea name="question" placeholder='e.g. "Which customers owe us the most?" / "这个月该重点跟进谁？"' />
        <Working label="Ask" />
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      </form>
      {state?.ok && (
        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700">{state.answer}</pre>
        </div>
      )}
    </Card>
  );
}
