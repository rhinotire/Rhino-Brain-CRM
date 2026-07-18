"use client";

import { useState } from "react";
import Link from "next/link";
import { calcTire, parseTireSize, formatTireSize, type TireSpec } from "@/lib/tire-math";

/**
 * Staggered (different front/rear) fitment checker. All math is per-axle
 * tire geometry; guidance follows the standard rules: keep front/rear
 * overall diameters close, never stagger an AWD car unless the factory did,
 * and remember staggered sets can't rotate front-to-rear.
 */

const fmt = (n: number, d = 1) => n.toFixed(d);

function AxleInput({ id, label, value, onChange, fallbackRim }: {
  id: string; label: string; value: string; onChange: (v: string) => void; fallbackRim: number;
}) {
  const parsed = parseTireSize(value, fallbackRim);
  const bad = value.trim().length >= 6 && !parsed;
  return (
    <div className={`rounded-2xl border-2 p-4 ${label === "Front" ? "border-slate-300" : "border-brand"}`}>
      <div className={`text-sm font-bold uppercase tracking-wide ${label === "Front" ? "text-slate-500" : "text-brand-dark"}`}>
        {label} tires {parsed && <span className="ml-1 normal-case text-steel-500">— {formatTireSize(parsed)}</span>}
      </div>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} autoComplete="off"
        placeholder='"255/40R19" · digits work too'
        className={`mt-2 w-full rounded-lg border px-3 py-2.5 text-sm text-navy-900 ${bad ? "border-red-400" : "border-slate-300"}`} />
    </div>
  );
}

export function StaggeredCalculator() {
  const [frontText, setFrontText] = useState("255/40R19");
  const [rearText, setRearText] = useState("275/40R19");

  const pf: TireSpec | null = parseTireSize(frontText, 19);
  const pr: TireSpec | null = parseTireSize(rearText, 19);
  const cf = pf ? calcTire(pf) : null;
  const cr = pr ? calcTire(pr) : null;
  const diffPct = cf && cr ? ((cr.diameterIn - cf.diameterIn) / cf.diameterIn) * 100 : 0;
  const widthDiff = cf && cr ? cr.widthIn - cf.widthIn : 0;

  const verdict =
    !cf || !cr
      ? null
      : diffPct < -1.5
        ? { cls: "bg-red-50 text-red-900", text: `The front is ${fmt(Math.abs(diffPct))}% taller than the rear — that's backwards for a staggered setup. Check whether the sizes are swapped.` }
        : Math.abs(diffPct) <= 3
          ? { cls: "bg-emerald-50 text-emerald-900", text: `Rear ${diffPct >= 0 ? "+" : ""}${fmt(diffPct)}% in diameter — right in line with typical factory staggered fitments (Mustang GT runs +2.3%, Camaro SS −0.5%).` }
          : diffPct <= 7
            ? { cls: "bg-amber-50 text-amber-900", text: `Rear +${fmt(diffPct)}% taller — a big rake. Some extreme factory setups go this far, but verify it matches YOUR car's factory fitment; speedometer and stability control are calibrated around the stock diameters.` }
            : { cls: "bg-red-50 text-red-900", text: `Rear +${fmt(diffPct)}% taller — beyond almost every factory setup (even a Viper runs about +9%). Confirm the sizes before ordering.` };

  return (
    // translate="no"/notranslate: page-translator extensions rewrite DOM text
    // and crash React updates — keep the interactive widget untouched
    <div translate="no" className="notranslate">
      <div className="grid gap-4 sm:grid-cols-2">
        <AxleInput id="stg-front" label="Front" value={frontText} onChange={setFrontText} fallbackRim={19} />
        <AxleInput id="stg-rear" label="Rear" value={rearText} onChange={setRearText} fallbackRim={19} />
      </div>

      {cf && cr ? (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-steel-100 p-5 text-center">
              <div className="text-xs font-bold uppercase tracking-wide text-steel-500">Front diameter</div>
              <div className="mt-1 font-display text-3xl font-bold text-navy-900">{fmt(cf.diameterIn)}&quot;</div>
              <div className="text-xs text-steel-500">{fmt(cf.widthIn)}&quot; wide · {Math.round(cf.revsPerMile)} revs/mi</div>
            </div>
            <div className="rounded-2xl bg-steel-100 p-5 text-center">
              <div className="text-xs font-bold uppercase tracking-wide text-steel-500">Rear diameter</div>
              <div className="mt-1 font-display text-3xl font-bold text-navy-900">{fmt(cr.diameterIn)}&quot;</div>
              <div className="text-xs text-steel-500">{fmt(cr.widthIn)}&quot; wide · {Math.round(cr.revsPerMile)} revs/mi</div>
            </div>
            <div className="rounded-2xl bg-navy-900 p-5 text-center text-white">
              <div className="text-xs font-bold uppercase tracking-wide text-brand-light">Diameter difference</div>
              <div className="mt-1 font-display text-3xl font-bold text-brand">{diffPct >= 0 ? "+" : ""}{fmt(diffPct)}%</div>
              <div className="text-xs text-steel-300">rear {widthDiff >= 0 ? `+${fmt(widthDiff)}` : fmt(widthDiff)}&quot; wider</div>
            </div>
          </div>

          {verdict && <p className={`mt-4 rounded-xl p-4 text-sm ${verdict.cls}`}>{verdict.text}</p>}
          {widthDiff < 0 && (
            <p className="mt-2 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
              The rear is <b>narrower</b> than the front — staggered setups almost always run the wider tire on the
              drive (rear) axle. Double-check the sizes aren&apos;t swapped.
            </p>
          )}

          <div className="mt-4 rounded-xl border border-slate-200 p-4 text-sm text-slate-600">
            <span className="font-bold text-navy-900">Staggered rules of thumb:</span> never stagger an AWD vehicle
            unless it left the factory that way (driveline wind-up). Staggered sets can&apos;t rotate front-to-rear, so
            drive-axle tires wear faster — budget with the{" "}
            <Link href="/tools/cost-per-mile-calculator" className="font-bold text-brand-dark">cost per mile calculator</Link>{" "}
            and always replace in axle pairs.
          </div>
        </>
      ) : (
        <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">
          Enter a valid size for each axle — e.g. 255/40R19 front, 275/40R19 rear.
        </p>
      )}
    </div>
  );
}
