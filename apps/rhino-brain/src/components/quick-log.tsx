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

/** Shrink a phone photo to ≤1600px JPEG so field uploads stay fast and small. */
async function compressPhoto(file: File): Promise<File> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, "image/jpeg", 0.8));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file; // formats the browser can't decode go up as-is (size-checked server-side)
  }
}

/** One-tap common subjects — click to fill, still fully editable. */
const SUBJECT_PRESETS = [
  "Restock pricing", "New order", "Follow up on quote", "Check stock",
  "Payment reminder", "New product intro", "Check-in", "Price negotiation",
];

/** Outside-sales presets — shown when the type is an in-person VISIT. */
const VISIT_PRESETS = [
  "Store visit", "New prospect visit", "Delivery / drop-off", "Sample drop-off",
  "Collected payment", "Checked their inventory", "Met the owner", "Resolved issue on site",
];

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
  const [subject, setSubject] = useState("");
  const [type, setType] = useState<string>(defaultType);
  const [pickedCustomerId, setPickedCustomerId] = useState("");
  const [lostItem, setLostItem] = useState("");
  const [lostStockNote, setLostStockNote] = useState("");
  const [visitLocation, setVisitLocation] = useState("");
  const [locating, setLocating] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [state, action] = useFormState(logActivity, null);
  const toast = useToast();
  const isLost = outcome.startsWith("LOST");
  const isVisit = type === "VISIT";

  const checkIn = () => {
    if (!navigator.geolocation) { toast("This device has no location service", "error"); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude, accuracy } = pos.coords;
        setVisitLocation(`https://maps.google.com/?q=${latitude.toFixed(6)},${longitude.toFixed(6)} (±${Math.round(accuracy)}m)`);
        setLocating(false);
        toast("Location captured");
      },
      () => { setLocating(false); toast("Could not get location — allow location access and try again", "error"); },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  };

  useEffect(() => {
    if (state?.ok) { toast("Activity logged"); setOpen(false); setSubject(""); setOutcome(""); setLostItem(""); setLostStockNote(""); setVisitLocation(""); setPhotos([]); }
    if (state?.error) toast(state.error, "error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>{label}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Log Activity">
        <form action={(fd: FormData) => { photos.forEach(p => fd.append("photos", p)); action(fd); }} className="space-y-3">
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Activity Type">
              <Select name="type" value={type} onChange={e => setType(e.target.value)}>
                {Object.entries(activityTypeLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
            <Field label="Next Follow-up">
              <Input name="nextFollowUpAt" type="date" />
            </Field>
          </div>
          {isVisit && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2.5">
              {visitLocation ? (
                <div className="flex flex-wrap items-center gap-2 text-sm text-emerald-800">
                  <span>📍 Checked in</span>
                  <a href={visitLocation.split(" ")[0]} target="_blank" rel="noopener" className="font-medium underline">view on map</a>
                  <button type="button" className="text-xs text-slate-500 underline" onClick={() => setVisitLocation("")}>remove</button>
                </div>
              ) : (
                <button type="button" onClick={checkIn} disabled={locating}
                  className="text-sm font-medium text-emerald-700 hover:text-emerald-900">
                  {locating ? "Getting your location…" : "📍 Check in at this location (proof of visit)"}
                </button>
              )}
              <input type="hidden" name="visitLocation" value={visitLocation} />
            </div>
          )}
          {isVisit && (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-2.5">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
                📷 {photos.length ? `${photos.length} photo${photos.length > 1 ? "s" : ""} ready to upload` : "Add photos — storefront, shelves, price board… (max 3)"}
                <input type="file" accept="image/*" multiple className="hidden"
                  onChange={async e => {
                    const list = Array.from(e.target.files ?? []).slice(0, 3);
                    if (list.length) setPhotos(await Promise.all(list.map(compressPhoto)));
                    e.target.value = "";
                  }} />
              </label>
              {photos.length > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  {photos.map((p, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={URL.createObjectURL(p)} alt={`photo ${i + 1}`} className="h-14 w-14 rounded-md border border-slate-200 object-cover" />
                  ))}
                  <button type="button" className="text-xs text-slate-500 underline" onClick={() => setPhotos([])}>remove</button>
                </div>
              )}
            </div>
          )}
          <Field label="Subject *">
            <>
              <div className="mb-1.5 flex flex-wrap gap-1.5">
                {(isVisit ? VISIT_PRESETS : SUBJECT_PRESETS).map(s => (
                  <button key={s} type="button" onClick={() => setSubject(s)}
                    className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-600 hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700">
                    {s}
                  </button>
                ))}
              </div>
              <Input name="subject" required value={subject} onChange={e => setSubject(e.target.value)}
                placeholder="e.g. Called about TBR restock pricing" />
            </>
          </Field>
          <Field label="Outcome">
            <Select name="outcome" value={outcome} onChange={e => setOutcome(e.target.value)}>
              <option value="">— normal conversation —</option>
              <optgroup label="Positive">
                <option value="POSITIVE">✅ Positive — order / quote coming</option>
                <option value="QUOTE_SENT">📝 Quote sent — awaiting decision</option>
                <option value="CALLBACK">📅 Callback scheduled / thinking it over</option>
              </optgroup>
              <optgroup label="Lost sale">
                <option value="LOST_NO_STOCK">❌ Lost — we had NO STOCK</option>
                <option value="LOST_PRICE">❌ Lost — competitor PRICE</option>
                <option value="LOST_OTHER">❌ Lost — other reason</option>
              </optgroup>
              <optgroup label="Other">
                <option value="NO_NEED">💤 No current need</option>
                <option value="NOT_INTERESTED">🚫 Not interested / do not contact</option>
                <option value="COMPLAINT">⚠️ Complaint / issue raised</option>
                <option value="PAYMENT">💰 Payment / collection discussed</option>
              </optgroup>
            </Select>
          </Field>
          {isLost && (
            <div className="space-y-3 rounded-md border border-red-200 bg-red-50 p-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Est. lost value $">
                  <Input name="lostValue" type="number" min={0} step="0.01" placeholder="2500" />
                </Field>
                {outcome === "LOST_PRICE" && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
