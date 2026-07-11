"use client";

import { useEffect, useState } from "react";
import { useFormState } from "react-dom";
import { logActivity } from "@/actions/activities";
import { ProductPicker, stockLabel } from "@/components/product-picker";
import { Modal } from "@/components/ui/modal";
import { Button, Input, Select, Textarea, Field } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { useToast } from "@/components/ui/toast";
import { activityTypeLabels } from "@/lib/domain";

export type CustomerOption = { id: string; companyName: string };

/**
 * Quick "Log Call / Add Note / …" button + modal.
 * Pass a fixed customerId/leadId (customer page) or a customers list (My Work page).
 */
export function QuickLogButton({
  customerId, leadId, quoteId, customers = [], defaultType = "CALL", label = "Log Call",
  variant = "primary", size = "md",
}: {
  customerId?: string; leadId?: string; quoteId?: string;
  customers?: CustomerOption[];
  defaultType?: keyof typeof activityTypeLabels;
  label?: string;
  variant?: "primary" | "secondary" | "ghost" | "success";
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState("");
  const [pickedCustomerId, setPickedCustomerId] = useState("");
  const [lostItem, setLostItem] = useState("");
  const [lostStockNote, setLostStockNote] = useState("");
  const [state, action] = useFormState(logActivity, null);
  const toast = useToast();
  const isLost = outcome.startsWith("LOST");

  useEffect(() => {
    if (state?.ok) { toast("Activity logged"); setOpen(false); }
    if (state?.error) toast(state.error, "error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>{label}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Log Activity">
        <form action={action} className="space-y-3">
          {customerId && <input type="hidden" name="customerId" value={customerId} />}
          {leadId && <input type="hidden" name="leadId" value={leadId} />}
          {quoteId && <input type="hidden" name="quoteId" value={quoteId} />}
          {!customerId && !leadId && (
            <Field label="Customer *">
              <>
                <Input list="ql-cust-list" placeholder="Type a customer name…" autoComplete="off" required
                  onChange={e => {
                    const opt = document.querySelector<HTMLOptionElement>(`#ql-cust-list option[value="${CSS.escape(e.target.value)}"]`);
                    setPickedCustomerId(opt?.dataset.id ?? "");
                  }} />
                <datalist id="ql-cust-list">
                  {customers.map(c => <option key={c.id} value={c.companyName} data-id={c.id} />)}
                </datalist>
                <input type="hidden" name="customerId" value={pickedCustomerId} />
              </>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Activity Type">
              <Select name="type" defaultValue={defaultType}>
                {Object.entries(activityTypeLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
            <Field label="Next Follow-up">
              <Input name="nextFollowUpAt" type="date" />
            </Field>
          </div>
          <Field label="Subject *">
            <Input name="subject" required placeholder="e.g. Called about TBR restock pricing" />
          </Field>
          <Field label="Outcome">
            <Select name="outcome" value={outcome} onChange={e => setOutcome(e.target.value)}>
              <option value="">— normal conversation —</option>
              <option value="POSITIVE">✅ Positive — order / quote coming</option>
              <option value="LOST_NO_STOCK">❌ Lost sale — we had NO STOCK</option>
              <option value="LOST_PRICE">❌ Lost sale — competitor PRICE</option>
              <option value="LOST_OTHER">❌ Lost sale — other reason</option>
            </Select>
          </Field>
          {isLost && (
            <div className="space-y-3 rounded-md border border-red-200 bg-red-50 p-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Item / size they wanted">
                  <>
                    <ProductPicker value={lostItem} customerId={customerId || pickedCustomerId || undefined}
                      className="h-9 text-sm"
                      placeholder="Type size/SKU — searches your stock"
                      onType={v => { setLostItem(v); setLostStockNote(""); }}
                      onPick={h => { setLostItem(h.sizeSpec ?? h.sku); setLostStockNote(`${h.sku} — our stock: ${stockLabel(h)}`); }} />
                    <input type="hidden" name="lostItem" value={lostItem} />
                    {lostStockNote && <p className="mt-1 text-xs text-slate-500">📦 {lostStockNote}</p>}
                  </>
                </Field>
                <Field label="Quantity">
                  <Input name="lostQty" type="number" min={0} defaultValue={48} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Est. lost value $">
                  <Input name="lostValue" type="number" min={0} step="0.01" placeholder="2500" />
                </Field>
                {outcome === "LOST_PRICE" && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Competitor">
                      <Input name="lostCompetitor" placeholder="ATD / Horizon…" />
                    </Field>
                    <Field label="Their price">
                      <Input name="lostCompetitorPrice" type="number" min={0} step="0.01" />
                    </Field>
                  </div>
                )}
              </div>
            </div>
          )}
          <Field label="Notes">
            <Textarea name="notes" placeholder="What was discussed, prices mentioned, next steps…" />
          </Field>
          <div className="flex items-center gap-5 text-sm text-slate-600">
            <label className="flex items-center gap-1.5"><input type="checkbox" name="meaningful" /> Meaningful conversation</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" name="followUpRequired" /> Follow-up required</label>
          </div>
          {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <SubmitButton>Log activity</SubmitButton>
          </div>
        </form>
      </Modal>
    </>
  );
}
