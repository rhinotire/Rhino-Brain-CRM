"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { saveTireSpec } from "@/actions/tire-spec";

/** Vocab lists come from the server page — @rhino/services is server-only. */
export type SpecVocab = { treadType: string[]; application: string[]; position: string[]; loadRange: string[] };

const input = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
const label = "block text-xs font-bold uppercase tracking-wide text-slate-500";

const title = (s: string) => s.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

function Select({ name, value, options }: { name: string; value: string | null; options: readonly string[] }) {
  return (
    <select name={name} defaultValue={value ?? ""} className={input}>
      <option value="">—</option>
      {options.map((o) => <option key={o} value={o}>{title(o)}</option>)}
    </select>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
      {pending ? "Saving…" : "Save Specs"}
    </button>
  );
}

export type SpecValues = {
  loadIndex: string | null; speedRating: string | null; loadRange: string | null; plyRating: number | null;
  maxLoadLbs: number | null; maxPressurePsi: number | null; treadDepth32nds: number | null;
  treadType: string | null; application: string | null; position: string | null; construction: string | null;
  utqg: string | null; sidewallStyle: string | null; mileageWarrantyMiles: number | null;
  threePMSF: boolean; runFlat: boolean;
};

export function TireSpecEditor({ productId, pattern, patternCount, spec, vocab }: {
  productId: string; pattern: string | null; patternCount: number; spec: SpecValues; vocab: SpecVocab;
}) {
  const [state, action] = useFormState(saveTireSpec, {} as { ok?: boolean; appliedToPattern?: number; error?: string });
  const [patternText, setPatternText] = useState(pattern ?? "");

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="productId" value={productId} />

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-bold">Pattern specs</h2>
        <p className="mt-1 text-xs text-slate-500">Properties of the tread design — the same for every size of this pattern.</p>
        <div className="mt-4 max-w-xs">
          <label className={label} htmlFor="ts-pattern">Pattern name</label>
          <input id="ts-pattern" name="pattern" value={patternText} onChange={(e) => setPatternText(e.target.value)}
            placeholder='e.g. "F22", "ST-007"' className={input} />
          <p className="mt-1 text-[11px] text-slate-500">Groups all sizes of this tread design — enables the one-save apply below.</p>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div><span className={label}>Tread Type</span><Select name="treadType" value={spec.treadType} options={vocab.treadType} /></div>
          <div><span className={label}>Application</span><Select name="application" value={spec.application} options={vocab.application} /></div>
          <div><span className={label}>Position</span><Select name="position" value={spec.position} options={vocab.position} /></div>
          <div>
            <span className={label}>Construction</span>
            <select name="construction" defaultValue={spec.construction ?? ""} className={input}>
              <option value="">—</option><option value="R">Radial</option><option value="D">Bias</option>
            </select>
          </div>
          <div>
            <label className={label} htmlFor="ts-utqg">UTQG</label>
            <input id="ts-utqg" name="utqg" defaultValue={spec.utqg ?? ""} placeholder='e.g. "500 A B"' className={input} />
          </div>
          <div>
            <label className={label} htmlFor="ts-mile">Mileage Warranty (miles)</label>
            <input id="ts-mile" name="mileageWarrantyMiles" defaultValue={spec.mileageWarrantyMiles ?? ""} inputMode="numeric" placeholder="e.g. 50000" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="ts-side">Sidewall Style</label>
            <input id="ts-side" name="sidewallStyle" defaultValue={spec.sidewallStyle ?? ""} placeholder="BSW / RWL / OWL" className={input} />
          </div>
          <div className="flex items-end gap-4 pb-1">
            <label className="flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-slate-600">
              <input type="checkbox" name="threePMSF" defaultChecked={spec.threePMSF} className="h-4 w-4" /> ❄ 3PMSF
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-slate-600">
              <input type="checkbox" name="runFlat" defaultChecked={spec.runFlat} className="h-4 w-4" /> Run Flat
            </label>
          </div>
        </div>
        {patternText.trim() && (
          <label className="mt-4 flex cursor-pointer items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">
            <input type="checkbox" name="applyToPattern" defaultChecked className="h-4 w-4" />
            {patternCount > 0 && patternText.trim() === (pattern ?? "")
              ? `Apply these pattern specs to all ${patternCount} other ${pattern} sizes`
              : `Apply to every ${patternText.trim()} size of this brand (matched by pattern or description)`}
          </label>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-bold">This size only</h2>
        <p className="mt-1 text-xs text-slate-500">Stamped service values — copy them from the sidewall or the spec sheet.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-4">
          <div>
            <label className={label} htmlFor="ts-li">Load Index</label>
            <input id="ts-li" name="loadIndex" defaultValue={spec.loadIndex ?? ""} placeholder='"94" or "121/118"' className={input} />
          </div>
          <div>
            <label className={label} htmlFor="ts-sr">Speed Rating</label>
            <input id="ts-sr" name="speedRating" defaultValue={spec.speedRating ?? ""} placeholder="H" maxLength={1} className={input} />
          </div>
          <div>
            <span className={label}>Load Range</span>
            <select name="loadRange" defaultValue={spec.loadRange ?? ""} className={input}>
              <option value="">—</option>
              {vocab.loadRange.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className={label} htmlFor="ts-ply">Ply Rating</label>
            <input id="ts-ply" name="plyRating" defaultValue={spec.plyRating ?? ""} inputMode="numeric" placeholder="10" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="ts-maxload">Max Load (lbs/tire)</label>
            <input id="ts-maxload" name="maxLoadLbs" defaultValue={spec.maxLoadLbs ?? ""} inputMode="numeric" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="ts-psi">Max Pressure (PSI)</label>
            <input id="ts-psi" name="maxPressurePsi" defaultValue={spec.maxPressurePsi ?? ""} inputMode="numeric" className={input} />
          </div>
          <div>
            <label className={label} htmlFor="ts-depth">Tread Depth (/32&quot;)</label>
            <input id="ts-depth" name="treadDepth32nds" defaultValue={spec.treadDepth32nds ?? ""} inputMode="decimal" className={input} />
          </div>
        </div>
      </section>

      {state.error && <p className="text-sm font-semibold text-red-600">{state.error}</p>}
      {state.ok && (
        <p className="text-sm font-semibold text-emerald-700">
          Saved!{state.appliedToPattern ? ` Pattern specs applied to ${state.appliedToPattern} other sizes.` : ""} The website updates within ~5 minutes.
        </p>
      )}
      <Submit />
    </form>
  );
}
