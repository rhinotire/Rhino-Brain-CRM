"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { submitAccountSetup } from "@/actions/account-setup";

const input = "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base";
const label = "mt-4 block text-sm font-semibold text-slate-700";
const hint = "block text-xs font-normal text-slate-400";

const TYPES: [string, string][] = [
  ["TIRE_SHOP", "Tire shop / Llantera"],
  ["CAR_DEALER", "Car dealer / Venta de autos"],
  ["TRAILER_MANUFACTURER", "Trailer manufacturer"],
  ["FLEET", "Fleet / Flotilla"],
  ["REPAIR_SHOP", "Repair shop / Taller"],
  ["WHOLESALE_DEALER", "Wholesale dealer / Mayorista"],
  ["ONLINE_BUYER", "Online seller"],
  ["OTHER", "Other / Otro"],
];

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending}
      className="mt-6 w-full rounded-lg bg-emerald-600 px-5 py-3.5 text-base font-bold text-white disabled:opacity-60">
      {pending ? "Submitting… / Enviando…" : "Submit application / Enviar solicitud"}
    </button>
  );
}

/** Public wholesale-account application — prefilled with what the CRM already knows. */
export function AccountSetupForm({ token, companyName, prefill }: {
  token: string;
  companyName: string;
  prefill: { contactPerson: string; phone: string; cell: string; email: string; address: string; city: string; state: string; zip: string };
}) {
  const [state, action] = useFormState(submitAccountSetup, null);
  const [certName, setCertName] = useState("");

  if (state?.ok) {
    return (
      <div className="rounded-xl bg-green-50 p-6 text-center">
        <div className="text-3xl">✅</div>
        <div className="mt-2 font-bold text-green-800">Application received — thank you!</div>
        <p className="mt-1 text-sm text-green-700">Your sales rep will confirm your wholesale account shortly. / Su representante confirmará su cuenta en breve.</p>
      </div>
    );
  }

  return (
    <form action={action}>
      <input type="hidden" name="token" value={token} />

      <h2 className="mt-6 border-b border-slate-200 pb-1 text-base font-bold text-slate-800">1. Business / Empresa</h2>
      <label className={label}>Legal business name * <span className={hint}>Nombre legal de la empresa</span></label>
      <input name="companyName" required minLength={2} className={input} defaultValue={companyName} />
      <label className={label}>DBA / store name (if different)</label>
      <input name="dba" className={input} />
      <label className={label}>Business type <span className={hint}>Tipo de negocio</span></label>
      <select name="businessType" className={input} defaultValue="TIRE_SHOP">
        {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <label className={label}>Sales tax ID / EIN <span className={hint}>Número de impuesto / EIN</span></label>
      <input name="taxId" className={input} />

      <h2 className="mt-8 border-b border-slate-200 pb-1 text-base font-bold text-slate-800">2. Contact / Contacto</h2>
      <label className={label}>Contact person * <span className={hint}>Persona de contacto</span></label>
      <input name="contactPerson" required className={input} defaultValue={prefill.contactPerson} />
      <label className={label}>Title <span className={hint}>Puesto</span></label>
      <input name="title" className={input} placeholder="Owner, Manager…" />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={label}>Cell *</label>
          <input name="cell" type="tel" required className={input} defaultValue={prefill.cell} />
        </div>
        <div>
          <label className={label}>Office phone</label>
          <input name="phone" type="tel" className={input} defaultValue={prefill.phone} />
        </div>
      </div>
      <label className={label}>Email *</label>
      <input name="email" type="email" required className={input} defaultValue={prefill.email} />

      <h2 className="mt-8 border-b border-slate-200 pb-1 text-base font-bold text-slate-800">3. Address / Dirección</h2>
      <label className={label}>Street address *</label>
      <input name="address" required className={input} defaultValue={prefill.address} />
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <label className={label}>City *</label>
          <input name="city" required className={input} defaultValue={prefill.city} />
        </div>
        <div>
          <label className={label}>State *</label>
          <input name="state" required className={input} defaultValue={prefill.state} placeholder="FL" />
        </div>
      </div>
      <label className={label}>ZIP *</label>
      <input name="zip" required inputMode="numeric" className={input} defaultValue={prefill.zip} />

      <h2 className="mt-8 border-b border-slate-200 pb-1 text-base font-bold text-slate-800">4. Resale certificate / Certificado de reventa</h2>
      <p className="mt-1 text-xs text-slate-500">Required for tax-free wholesale pricing — a clear photo or PDF. / Requerido para precios de mayoreo sin impuesto.</p>
      <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
        <span className="text-2xl">{certName ? "✅" : "📄"}</span>
        <span className="min-w-0 flex-1 text-sm font-semibold text-slate-700">
          {certName || "Tap to photograph or attach the certificate"}
        </span>
        <input type="file" name="resaleCert" accept="image/*,application/pdf" className="hidden"
          onChange={e => setCertName(e.target.files?.[0]?.name ?? "")} />
      </label>
      <label className={label}>Certificate expiration (if shown)</label>
      <input name="certExpiry" type="date" className={input} />

      <h2 className="mt-8 border-b border-slate-200 pb-1 text-base font-bold text-slate-800">5. Acknowledgment / Confirmación</h2>
      <label className="mt-3 flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
        <input type="checkbox" name="ack" required className="mt-0.5 h-5 w-5 shrink-0" />
        <span>
          I certify this information is accurate and I am authorized to open a wholesale account for this business.
          <span className="mt-1 block text-xs text-slate-500">Certifico que esta información es correcta y estoy autorizado para abrir una cuenta de mayoreo.</span>
        </span>
      </label>
      <label className={label}>Type your full name as signature * <span className={hint}>Escriba su nombre completo como firma</span></label>
      <input name="signature" required minLength={3} className={`${input} font-serif italic`} />

      {state?.error && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm font-semibold text-red-600">{state.error}</p>}
      <Submit />
    </form>
  );
}
