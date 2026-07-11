"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { submitConsumerRequest, type ConsumerFormState } from "@/app/consumer-actions";

const input = "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm";
const label = "mt-3 block text-sm font-semibold";

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="mt-4 w-full rounded-lg bg-brand px-5 py-3 text-sm font-bold text-ink disabled:opacity-60 sm:w-auto">
      {pending ? "Sending…" : children}
    </button>
  );
}

/**
 * Installed-price / appointment request on an installer card. Short and
 * progressive (spec §24): two buttons expand into one compact form.
 */
export function ConsumerRequestForm({
  installerId,
  productId,
  tireSize,
  zip,
  appointmentEnabled,
}: {
  installerId: string;
  productId?: string;
  tireSize?: string;
  zip: string;
  appointmentEnabled: boolean;
}) {
  const [kind, setKind] = useState<"INSTALLED_PRICE" | "APPOINTMENT" | null>(null);
  const [state, action] = useFormState<ConsumerFormState, FormData>(submitConsumerRequest, {});

  if (state.ok) return null; // server action redirects to /request/[token]; this is just a fallback

  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      {!kind ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setKind("INSTALLED_PRICE")} className="rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-ink">
            Check Installed Price
          </button>
          {appointmentEnabled && (
            <button type="button" onClick={() => setKind("APPOINTMENT")} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-bold">
              Request Appointment
            </button>
          )}
        </div>
      ) : (
        <form action={action} className="max-w-md">
          <div className="text-sm font-bold">{kind === "INSTALLED_PRICE" ? "Request installed price" : "Request an appointment"}</div>
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="installerId" value={installerId} />
          {productId && <input type="hidden" name="productId" value={productId} />}
          {tireSize && <input type="hidden" name="tireSize" value={tireSize} />}
          <input type="hidden" name="zip" value={zip} />
          <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
          <label className={label} htmlFor={`cr-name-${installerId}`}>Name *</label>
          <input id={`cr-name-${installerId}`} name="name" required minLength={2} className={input} />
          <div className="grid gap-x-3 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor={`cr-phone-${installerId}`}>Mobile phone *</label>
              <input id={`cr-phone-${installerId}`} name="phone" type="tel" required minLength={7} className={input} />
            </div>
            <div>
              <label className={label} htmlFor={`cr-qty-${installerId}`}>Quantity *</label>
              <select id={`cr-qty-${installerId}`} name="quantity" defaultValue="4" className={input}>
                {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
          {!tireSize && !productId && (
            <>
              <label className={label} htmlFor={`cr-size-${installerId}`}>Tire size *</label>
              <input id={`cr-size-${installerId}`} name="tireSize" required placeholder="e.g. ST235/80R16" className={input} />
            </>
          )}
          {kind === "APPOINTMENT" && (
            <>
              <label className={label} htmlFor={`cr-date-${installerId}`}>Preferred date</label>
              <input id={`cr-date-${installerId}`} name="preferredDate" type="date" className={input} />
            </>
          )}
          <label className={label} htmlFor={`cr-veh-${installerId}`}>Vehicle or trailer (optional)</label>
          <input id={`cr-veh-${installerId}`} name="vehicle" placeholder="e.g. 2021 F-250 / 16ft utility trailer" className={input} />
          <label className="mt-3 flex items-start gap-2 text-xs text-slate-600">
            <input type="checkbox" name="consent" value="true" required className="mt-0.5" />
            I agree to be contacted about this request by phone, text, or email by the store and its supplier.
          </label>
          {state.error && <p className="mt-2 text-sm font-semibold text-red-600">{state.error}</p>}
          <div className="flex items-center gap-3">
            <Submit>{kind === "INSTALLED_PRICE" ? "Get My Installed Price" : "Request Appointment"}</Submit>
            <button type="button" onClick={() => setKind(null)} className="mt-4 text-sm text-slate-500 underline">Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}

/** Fallback when no installer is available (spec §9 priority 3) — never a dead end. */
export function InstallerNeededForm({ zip, productId, tireSize }: { zip: string; productId?: string; tireSize?: string }) {
  const [state, action] = useFormState<ConsumerFormState, FormData>(submitConsumerRequest, {});
  if (state.ok) return null;
  return (
    <form action={action} className="max-w-md">
      <input type="hidden" name="kind" value="INSTALLER_NEEDED" />
      {productId && <input type="hidden" name="productId" value={productId} />}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      <label className={label} htmlFor="in-name">Name *</label>
      <input id="in-name" name="name" required minLength={2} className={input} />
      <div className="grid gap-x-3 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="in-phone">Mobile phone *</label>
          <input id="in-phone" name="phone" type="tel" required minLength={7} className={input} />
        </div>
        <div>
          <label className={label} htmlFor="in-zip">ZIP code *</label>
          <input id="in-zip" name="zip" required pattern="\d{5}" defaultValue={zip} className={input} />
        </div>
      </div>
      <div className="grid gap-x-3 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="in-size">Tire size *</label>
          <input id="in-size" name="tireSize" required defaultValue={tireSize} placeholder="e.g. ST235/80R16" className={input} />
        </div>
        <div>
          <label className={label} htmlFor="in-qty">Quantity *</label>
          <select id="in-qty" name="quantity" defaultValue="4" className={input}>
            {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>
      <label className={label} htmlFor="in-msg">Anything else?</label>
      <textarea id="in-msg" name="message" rows={2} className={input} />
      <label className="mt-3 flex items-start gap-2 text-xs text-slate-600">
        <input type="checkbox" name="consent" value="true" required className="mt-0.5" />
        I agree to be contacted about this request by phone, text, or email.
      </label>
      {state.error && <p className="mt-2 text-sm font-semibold text-red-600">{state.error}</p>}
      <Submit>Help Me Find an Installer</Submit>
    </form>
  );
}
