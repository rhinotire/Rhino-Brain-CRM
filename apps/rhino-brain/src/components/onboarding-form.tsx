"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { submitOnboarding } from "@/actions/onboarding";
import { isValidRoutingNumber } from "@/lib/onboarding";

const input = "w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base";
const label = "mt-4 block text-sm font-semibold text-slate-700";
const hint = "block text-xs font-normal text-slate-400";

/** Shrink phone photos to ≤1600px JPEG; PDFs pass through untouched. */
async function compressUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, "image/jpeg", 0.82));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

function UploadSlot({ name, labelEn, labelEs, file, onPick }: {
  name: string; labelEn: string; labelEs: string; file: File | null; onPick: (f: File | null) => void;
}) {
  return (
    <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
      <span className="text-2xl">{file ? "✅" : "📷"}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-700">{labelEn}</span>
        <span className="block truncate text-xs text-slate-400">{file ? file.name : labelEs}</span>
      </span>
      {file && (
        <button type="button" className="shrink-0 text-xs text-slate-500 underline"
          onClick={e => { e.preventDefault(); onPick(null); }}>
          remove
        </button>
      )}
      <input type="file" accept="image/*,application/pdf" className="hidden"
        onChange={async e => {
          const f = e.target.files?.[0];
          if (f) onPick(await compressUpload(f));
          e.target.value = "";
        }} />
      <span className="sr-only">{name}</span>
    </label>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending}
      className="mt-6 w-full rounded-lg bg-emerald-600 px-5 py-3.5 text-base font-bold text-white disabled:opacity-60">
      {pending ? "Submitting… / Enviando…" : "Submit / Enviar"}
    </button>
  );
}

/** Public new-hire form — typed on the employee's phone, no handwriting to misread. */
export function OnboardingForm({ token, employeeName, companyName }: {
  token: string; employeeName: string; companyName: string;
}) {
  const [state, action] = useFormState(submitOnboarding, null);
  const [routing, setRouting] = useState("");
  const [acct, setAcct] = useState("");
  const [acct2, setAcct2] = useState("");
  const [w4File, setW4File] = useState<File | null>(null);
  const [i9File, setI9File] = useState<File | null>(null);
  const [dlFile, setDlFile] = useState<File | null>(null);
  const routingOk = routing.length === 9 && isValidRoutingNumber(routing);
  const acctMatch = acct.length >= 4 && acct === acct2;

  if (state?.ok) {
    return (
      <div className="rounded-xl bg-green-50 p-6 text-center">
        <div className="text-3xl">✅</div>
        <div className="mt-2 font-bold text-green-800">All done — thank you!</div>
        <p className="mt-1 text-sm text-green-700">Your information was sent securely to {companyName}. / Su información fue enviada de forma segura.</p>
      </div>
    );
  }

  const submit = (fd: FormData) => {
    if (w4File) fd.append("w4File", w4File);
    if (i9File) fd.append("i9File", i9File);
    if (dlFile) fd.append("dlFile", dlFile);
    action(fd);
  };

  return (
    <form action={submit}>
      <input type="hidden" name="token" value={token} />

      <h2 className="mt-6 border-b border-slate-200 pb-1 text-base font-bold text-slate-800">1. Your information / Su información</h2>
      <label className={label}>Full legal name * <span className={hint}>Nombre legal completo</span></label>
      <input name="legalName" required minLength={3} className={input} defaultValue={employeeName} autoComplete="name" />
      <label className={label}>Cell phone * <span className={hint}>Teléfono celular</span></label>
      <input name="phone" type="tel" required className={input} autoComplete="tel" />
      <label className={label}>Email</label>
      <input name="email" type="email" className={input} autoComplete="email" />
      <label className={label}>Home address <span className={hint}>Dirección</span></label>
      <input name="address" className={input} autoComplete="street-address" />
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <label className={label}>City / Ciudad</label>
          <input name="city" className={input} />
        </div>
        <div>
          <label className={label}>State</label>
          <input name="state" className={input} placeholder="FL" />
        </div>
      </div>
      <label className={label}>ZIP</label>
      <input name="zip" inputMode="numeric" className={input} autoComplete="postal-code" />

      <h2 className="mt-8 border-b border-slate-200 pb-1 text-base font-bold text-slate-800">2. Emergency contact / Contacto de emergencia</h2>
      <label className={label}>Contact name * <span className={hint}>Nombre</span></label>
      <input name="ecName" required className={input} />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={label}>Relationship <span className={hint}>Parentesco</span></label>
          <input name="ecRelation" className={input} placeholder="Spouse, parent…" />
        </div>
        <div>
          <label className={label}>Phone *</label>
          <input name="ecPhone" type="tel" required className={input} />
        </div>
      </div>

      <h2 className="mt-8 border-b border-slate-200 pb-1 text-base font-bold text-slate-800">3. Direct deposit / Depósito directo</h2>
      <p className="mt-1 text-xs text-slate-500">Type the numbers from a check or your banking app — the form checks them for typos. / Copie los números de un cheque o su aplicación bancaria.</p>
      <label className={label}>Bank name * <span className={hint}>Banco</span></label>
      <input name="bankName" required className={input} placeholder="Chase, Bank of America…" />
      <label className={label}>Routing number (9 digits) * <span className={hint}>Número de ruta</span></label>
      <input name="routingNumber" required inputMode="numeric" maxLength={9} className={`${input} ${routing.length === 9 ? (routingOk ? "border-emerald-500" : "border-red-500") : ""}`}
        value={routing} onChange={e => setRouting(e.target.value.replace(/\D/g, "").slice(0, 9))} />
      {routing.length === 9 && (
        <p className={`mt-1 text-xs font-semibold ${routingOk ? "text-emerald-600" : "text-red-600"}`}>
          {routingOk ? "✓ Valid routing number" : "✗ Not a valid routing number — please check it / Número de ruta incorrecto"}
        </p>
      )}
      <label className={label}>Account number * <span className={hint}>Número de cuenta</span></label>
      <input name="accountNumber" required inputMode="numeric" maxLength={17} className={input}
        value={acct} onChange={e => setAcct(e.target.value.replace(/\D/g, "").slice(0, 17))} />
      <label className={label}>Re-type account number * <span className={hint}>Escriba la cuenta otra vez</span></label>
      <input name="accountNumber2" required inputMode="numeric" maxLength={17} className={`${input} ${acct2.length >= 4 ? (acctMatch ? "border-emerald-500" : "border-red-500") : ""}`}
        value={acct2} onChange={e => setAcct2(e.target.value.replace(/\D/g, "").slice(0, 17))} />
      {acct2.length >= 4 && !acctMatch && <p className="mt-1 text-xs font-semibold text-red-600">✗ The two account numbers don&apos;t match / Los números no coinciden</p>}
      <label className={label}>Account type</label>
      <select name="accountType" className={input} defaultValue="checking">
        <option value="checking">Checking / Corriente</option>
        <option value="savings">Savings / Ahorros</option>
      </select>

      <h2 className="mt-8 border-b border-slate-200 pb-1 text-base font-bold text-slate-800">4. Signed forms — photo or PDF (optional) / Formularios firmados</h2>
      <p className="mt-1 text-xs text-slate-500">
        If your manager gave you a W-4 or I-9 to sign, take a clear photo of each signed page here. / Si le dieron un W-4 o I-9 firmado, tome una foto clara de cada página.
      </p>
      <UploadSlot name="w4File" labelEn="W-4 (signed)" labelEs="Foto del W-4 firmado" file={w4File} onPick={setW4File} />
      <UploadSlot name="i9File" labelEn="I-9 (Section 1 completed)" labelEs="Foto del I-9 (Sección 1)" file={i9File} onPick={setI9File} />
      <UploadSlot name="dlFile" labelEn="Driver license / Photo ID" labelEs="Licencia de conducir o identificación" file={dlFile} onPick={setDlFile} />

      <h2 className="mt-8 border-b border-slate-200 pb-1 text-base font-bold text-slate-800">5. Acknowledgment / Confirmación</h2>
      <label className="mt-3 flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
        <input type="checkbox" name="ack" required className="mt-0.5 h-5 w-5 shrink-0" />
        <span>
          I certify the information above is accurate and authorize {companyName} to deposit my pay to this account.
          <span className="mt-1 block text-xs text-slate-500">Certifico que la información es correcta y autorizo el depósito de mi pago en esta cuenta.</span>
        </span>
      </label>
      <label className={label}>Type your full name as signature * <span className={hint}>Escriba su nombre completo como firma</span></label>
      <input name="signature" required minLength={3} className={`${input} font-serif italic`} placeholder={employeeName} />

      {state?.error && <p className="mt-4 rounded-md bg-red-50 p-3 text-sm font-semibold text-red-600">{state.error}</p>}
      <Submit />
    </form>
  );
}
