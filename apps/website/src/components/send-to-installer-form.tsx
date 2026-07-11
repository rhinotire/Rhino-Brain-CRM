"use client";

import { useFormState, useFormStatus } from "react-dom";
import { submitSendToInstaller, type StiFormState } from "@/app/send-to-installer/actions";

const input = "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm";
const label = "mt-3 block text-sm font-semibold";
const section = "mt-6 rounded-xl border border-slate-200 p-4";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="mt-6 w-full rounded-lg bg-brand px-5 py-3 text-sm font-bold text-ink disabled:opacity-60 sm:w-auto">
      {pending ? "Sending…" : "Send This Request to My Shop"}
    </button>
  );
}

/** Spec §11 consumer form — short, progressive, mobile-first. */
export function SendToInstallerForm({ productId, productLabel, tireSize }: { productId?: string; productLabel?: string; tireSize?: string }) {
  const [state, action] = useFormState<StiFormState, FormData>(submitSendToInstaller, {});
  if (state.ok) return null; // action redirects on success

  return (
    <form action={action} className="max-w-xl">
      <input type="text" name="website_hp" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      {productId && <input type="hidden" name="productId" value={productId} />}
      {tireSize && <input type="hidden" name="tireSize" value={tireSize} />}

      <div className={section}>
        <div className="text-sm font-bold uppercase tracking-wide text-slate-500">1 · The product</div>
        <p className="mt-1 text-sm">{productLabel ?? "Tires"}{tireSize ? ` — ${tireSize}` : ""}</p>
        {!productId && !tireSize && (
          <>
            <label className={label} htmlFor="sti-size">Tire size *</label>
            <input id="sti-size" name="tireSize" required placeholder="e.g. ST235/80R16" className={input} />
          </>
        )}
        <label className={label} htmlFor="sti-qty">Quantity *</label>
        <select id="sti-qty" name="quantity" defaultValue="4" className={input}>
          {[1, 2, 3, 4, 5, 6, 8].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      <div className={section}>
        <div className="text-sm font-bold uppercase tracking-wide text-slate-500">2 · Your tire shop</div>
        <label className={label} htmlFor="sti-shop">Shop name *</label>
        <input id="sti-shop" name="installerName" required minLength={2} className={input} placeholder="e.g. Joe's Tire Center" />
        <div className="grid gap-x-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="sti-shop-phone">Shop phone</label>
            <input id="sti-shop-phone" name="installerPhone" type="tel" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="sti-shop-zip">Shop ZIP code *</label>
            <input id="sti-shop-zip" name="installerZip" required pattern="\d{5}" inputMode="numeric" className={input} />
          </div>
        </div>
        <label className={label} htmlFor="sti-shop-addr">Shop address (optional)</label>
        <input id="sti-shop-addr" name="installerAddress" className={input} />
        <label className={label} htmlFor="sti-shop-web">Shop website or Google Maps link (optional)</label>
        <input id="sti-shop-web" name="installerWebsite" className={input} />
        <p className="mt-2 text-xs text-slate-500">Only know where it is? Name + ZIP is enough — we&apos;ll find them.</p>
      </div>

      <div className={section}>
        <div className="text-sm font-bold uppercase tracking-wide text-slate-500">3 · You</div>
        <label className={label} htmlFor="sti-name">Your name *</label>
        <input id="sti-name" name="name" required minLength={2} className={input} />
        <div className="grid gap-x-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="sti-phone">Mobile phone *</label>
            <input id="sti-phone" name="phone" type="tel" required minLength={7} className={input} />
          </div>
          <div>
            <label className={label} htmlFor="sti-email">Email</label>
            <input id="sti-email" name="email" type="email" className={input} />
          </div>
        </div>
        <div className="grid gap-x-3 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="sti-zip">Your ZIP code *</label>
            <input id="sti-zip" name="zip" required pattern="\d{5}" inputMode="numeric" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="sti-date">Preferred install date</label>
            <input id="sti-date" name="preferredDate" type="date" className={input} />
          </div>
        </div>
        <label className={label} htmlFor="sti-veh">Vehicle or trailer (optional)</label>
        <input id="sti-veh" name="vehicle" className={input} placeholder="e.g. 16ft utility trailer" />
        <label className="mt-3 flex items-start gap-2 text-xs text-slate-600">
          <input type="checkbox" name="consent" value="true" required className="mt-0.5" />
          I agree that my request and contact information may be shared with the selected tire shop, and that the shop
          or its supplier may contact me about this request.
        </label>
      </div>

      {state.error && <p className="mt-3 text-sm font-semibold text-red-600">{state.error}</p>}
      <Submit />
    </form>
  );
}
