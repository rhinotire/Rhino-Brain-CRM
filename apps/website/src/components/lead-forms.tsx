"use client";

import { useFormState, useFormStatus } from "react-dom";
import { submitQuoteRequest, submitDealerApplication, submitFleetInquiry, type FormState } from "@/app/actions";
import { SITE } from "@/lib/site";

const input = "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm";
const label = "mt-4 block text-sm font-semibold";

/* Bilingual labels — `es` prop on each form switches these; English is the default. */
const T = {
  en: {
    sending: "Sending…",
    doneBody: "A sales rep will contact you within one business day. Need it faster? Call",
    company: "Company name *", contact: "Contact person *", phone: "Phone *", email: "Email", emailReq: "Email *",
    city: "City", state: "State", cityReq: "City *", stateReq: "State *",
    qProducts: "Sizes / products & quantities *", qMsg: "Anything else?", qSubmit: "Request Wholesale Quote", qDone: "Quote request received!",
    dType: "Business type *", dTypes: ["Tire shop", "Trailer manufacturer", "Trailer dealer / repair", "Fleet", "Auto repair", "Other reseller"],
    dSelect: "Select…", dAddress: "Business street address *", dVol: "Monthly volume", dVolPh: "e.g. 200 tires", dLocs: "# Locations", dZip: "Delivery ZIP",
    dProducts: "Products of interest", dProductsPh: "Trailer tires, wheels, assemblies…",
    dCert: "Resale certificate (PDF or photo, max 10 MB)", dCertNote: "Speeds up approval — you can also submit now and email it later.",
    dSubmit: "Apply for a Dealer Account", dDone: "Application received!",
  },
  es: {
    sending: "Enviando…",
    doneBody: "Un representante se comunicará con usted dentro de un día hábil. ¿Lo necesita más rápido? Llame al",
    company: "Nombre de la empresa *", contact: "Persona de contacto *", phone: "Teléfono *", email: "Correo electrónico", emailReq: "Correo electrónico *",
    city: "Ciudad", state: "Estado", cityReq: "Ciudad *", stateReq: "Estado *",
    qProducts: "Medidas / productos y cantidades *", qMsg: "¿Algo más?", qSubmit: "Solicitar Cotización de Mayoreo", qDone: "¡Solicitud recibida!",
    dType: "Tipo de negocio *", dTypes: ["Llantera", "Fabricante de remolques", "Venta / reparación de remolques", "Flotilla", "Taller mecánico", "Otro revendedor"],
    dSelect: "Seleccione…", dAddress: "Dirección del negocio *", dVol: "Volumen mensual", dVolPh: "ej. 200 llantas", dLocs: "# Sucursales", dZip: "Código postal de entrega",
    dProducts: "Productos de interés", dProductsPh: "Llantas de remolque, rines, montadas…",
    dCert: "Certificado de reventa (PDF o foto, máx. 10 MB)", dCertNote: "Acelera la aprobación — también puede enviarlo después por correo.",
    dSubmit: "Solicitar Cuenta de Distribuidor", dDone: "¡Solicitud recibida!",
  },
} as const;
type Lang = keyof typeof T;

function Submit({ children, lang = "en" }: { children: React.ReactNode; lang?: Lang }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="mt-6 w-full rounded-lg bg-brand px-5 py-3 text-sm font-bold text-ink disabled:opacity-60 sm:w-auto">
      {pending ? T[lang].sending : children}
    </button>
  );
}

function Done({ title, lang = "en" }: { title: string; lang?: Lang }) {
  return (
    <div className="mt-6 rounded-xl bg-green-50 p-6">
      <div className="font-bold text-green-800">{title}</div>
      <p className="mt-1 text-sm text-green-700">
        {T[lang].doneBody} <a className="font-bold" href={`tel:${SITE.phone}`}>{SITE.phoneDisplay}</a>.
      </p>
    </div>
  );
}

/* Honeypot: bots fill every field; humans never see this one. */
function Honeypot() {
  return <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />;
}

export function QuoteForm({ defaultSku, es }: { defaultSku?: string; es?: boolean }) {
  const lang: Lang = es ? "es" : "en";
  const t = T[lang];
  const [state, action] = useFormState<FormState, FormData>(submitQuoteRequest, {});
  if (state.ok) return <Done title={t.qDone} lang={lang} />;
  return (
    <form action={action} className="mt-2 max-w-xl">
      <Honeypot />
      <label className={label} htmlFor="q-company">{t.company}</label>
      <input id="q-company" name="companyName" required minLength={2} className={input} />
      <label className={label} htmlFor="q-contact">{t.contact}</label>
      <input id="q-contact" name="contactPerson" required minLength={2} className={input} />
      <div className="grid gap-x-3 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="q-phone">{t.phone}</label>
          <input id="q-phone" name="phone" type="tel" required minLength={7} className={input} />
        </div>
        <div>
          <label className={label} htmlFor="q-email">{t.email}</label>
          <input id="q-email" name="email" type="email" className={input} />
        </div>
      </div>
      <div className="grid gap-x-3 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="q-city">{t.city}</label>
          <input id="q-city" name="city" className={input} />
        </div>
        <div>
          <label className={label} htmlFor="q-state">{t.state}</label>
          <input id="q-state" name="state" className={input} />
        </div>
      </div>
      <label className={label} htmlFor="q-products">{t.qProducts}</label>
      <textarea id="q-products" name="productsOfInterest" required minLength={2} rows={3} className={input}
        defaultValue={defaultSku ? `SKU ${defaultSku} — qty: ` : ""} placeholder="e.g. ST235/80R16 x 48, 15x6 white spoke x 24" />
      <label className={label} htmlFor="q-msg">{t.qMsg}</label>
      <textarea id="q-msg" name="message" rows={2} className={input} />
      {state.error && <p className="mt-3 text-sm font-semibold text-red-600">{state.error}</p>}
      <Submit lang={lang}>{t.qSubmit}</Submit>
    </form>
  );
}

export function DealerForm({ es }: { es?: boolean }) {
  const lang: Lang = es ? "es" : "en";
  const t = T[lang];
  const [state, action] = useFormState<FormState, FormData>(submitDealerApplication, {});
  if (state.ok) return <Done title={t.dDone} lang={lang} />;
  return (
    <form action={action} className="mt-2 max-w-xl">
      <Honeypot />
      <label className={label} htmlFor="d-company">{t.company}</label>
      <input id="d-company" name="companyName" required minLength={2} className={input} />
      <label className={label} htmlFor="d-contact">{t.contact}</label>
      <input id="d-contact" name="contactPerson" required minLength={2} className={input} />
      <div className="grid gap-x-3 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="d-phone">{t.phone}</label>
          <input id="d-phone" name="phone" type="tel" required minLength={7} className={input} />
        </div>
        <div>
          <label className={label} htmlFor="d-email">{t.emailReq}</label>
          <input id="d-email" name="email" type="email" required className={input} />
        </div>
      </div>
      <label className={label} htmlFor="d-type">{t.dType}</label>
      {/* option VALUES stay English — the CRM lead pipeline reads them */}
      <select id="d-type" name="businessType" required className={input} defaultValue="">
        <option value="" disabled>{t.dSelect}</option>
        {T.en.dTypes.map((v, i) => (
          <option key={v} value={v}>{t.dTypes[i]}</option>
        ))}
      </select>
      <label className={label} htmlFor="d-address">{t.dAddress}</label>
      <input id="d-address" name="address" required minLength={3} className={input} placeholder="e.g. 11423 Satellite Blvd" />
      <div className="grid gap-x-3 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className={label} htmlFor="d-city">{t.cityReq}</label>
          <input id="d-city" name="city" required minLength={2} className={input} />
        </div>
        <div>
          <label className={label} htmlFor="d-state">{t.stateReq}</label>
          <input id="d-state" name="state" required minLength={2} maxLength={20} className={input} placeholder="FL" />
        </div>
      </div>
      <div className="grid gap-x-3 sm:grid-cols-3">
        <div>
          <label className={label} htmlFor="d-vol">{t.dVol}</label>
          <input id="d-vol" name="monthlyVolume" placeholder={t.dVolPh} className={input} />
        </div>
        <div>
          <label className={label} htmlFor="d-locs">{t.dLocs}</label>
          <input id="d-locs" name="locationsCount" className={input} />
        </div>
        <div>
          <label className={label} htmlFor="d-zip">{t.dZip}</label>
          <input id="d-zip" name="deliveryZip" className={input} />
        </div>
      </div>
      <label className={label} htmlFor="d-products">{t.dProducts}</label>
      <textarea id="d-products" name="productsOfInterest" rows={2} className={input} placeholder={t.dProductsPh} />
      <label className={label} htmlFor="d-cert">{t.dCert}</label>
      <input id="d-cert" name="resaleCert" type="file" accept="application/pdf,image/jpeg,image/png,image/webp"
        className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-4 file:py-2.5 file:text-sm file:font-semibold" />
      <p className="mt-1 text-xs text-slate-500">{t.dCertNote}</p>
      {state.error && <p className="mt-3 text-sm font-semibold text-red-600">{state.error}</p>}
      <Submit lang={lang}>{t.dSubmit}</Submit>
    </form>
  );
}

/** Fleet inquiry (master instruction §6.8) — feeds the same lead pipeline as quotes. */
export function FleetForm() {
  const [state, action] = useFormState<FormState, FormData>(submitFleetInquiry, {});
  if (state.ok) return <Done title="Fleet inquiry received!" />;
  return (
    <form action={action} className="mt-2 max-w-xl">
      <Honeypot />
      <label className={label} htmlFor="f-company">Company name *</label>
      <input id="f-company" name="companyName" required minLength={2} className={input} />
      <label className={label} htmlFor="f-contact">Contact person *</label>
      <input id="f-contact" name="contactPerson" required minLength={2} className={input} />
      <div className="grid gap-x-3 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="f-phone">Phone *</label>
          <input id="f-phone" name="phone" type="tel" required minLength={7} className={input} />
        </div>
        <div>
          <label className={label} htmlFor="f-email">Email</label>
          <input id="f-email" name="email" type="email" className={input} />
        </div>
      </div>
      <div className="grid gap-x-3 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="f-type">Fleet type *</label>
          <select id="f-type" name="fleetType" required className={input} defaultValue="">
            <option value="" disabled>Select…</option>
            <option>Trucking / long haul</option>
            <option>Regional delivery</option>
            <option>Construction</option>
            <option>Landscaping</option>
            <option>Trailer fleet</option>
            <option>Municipal / utility</option>
            <option>Other</option>
          </select>
        </div>
        <div>
          <label className={label} htmlFor="f-count"># of vehicles</label>
          <input id="f-count" name="vehicleCount" inputMode="numeric" className={input} placeholder="e.g. 24" />
        </div>
      </div>
      <label className={label} htmlFor="f-vtype">Vehicle types</label>
      <input id="f-vtype" name="vehicleType" className={input} placeholder="e.g. Class 8 tractors + 53' trailers, F-350 service trucks" />
      <label className={label} htmlFor="f-sizes">Common tire sizes *</label>
      <textarea id="f-sizes" name="commonSizes" required minLength={2} rows={2} className={input} placeholder="e.g. 295/75R22.5 steer + drive, ST235/80R16" />
      <div className="grid gap-x-3 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="f-demand">Monthly tire demand</label>
          <input id="f-demand" name="monthlyDemand" className={input} placeholder="e.g. 30–40 tires" />
        </div>
        <div>
          <label className={label} htmlFor="f-area">Service area</label>
          <input id="f-area" name="serviceArea" className={input} placeholder="e.g. DFW metro" />
        </div>
      </div>
      <div className="grid gap-x-3 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="f-city">City</label>
          <input id="f-city" name="city" className={input} />
        </div>
        <div>
          <label className={label} htmlFor="f-state">State</label>
          <input id="f-state" name="state" className={input} />
        </div>
      </div>
      <label className={label} htmlFor="f-chal">Current challenges</label>
      <textarea id="f-chal" name="challenges" rows={2} className={input} placeholder="e.g. inconsistent supply, too many sizes across the fleet" />
      {state.error && <p className="mt-3 text-sm font-semibold text-red-600">{state.error}</p>}
      <Submit>Request Fleet Program Quote</Submit>
    </form>
  );
}
