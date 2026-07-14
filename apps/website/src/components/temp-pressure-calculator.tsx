"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * Temperature ↔ tire pressure calculator. Real gas-law physics (absolute
 * temperature in Rankine): P2 = P1 × (T2 + 459.67) / (T1 + 459.67).
 * This beats the "1 psi per 10°F" rule of thumb at trailer/commercial
 * pressures (a 60-psi ST tire moves ~1.4 psi per 10°F).
 */

const R0 = 459.67; // °F → °R

const num = (t: string) => Number(t.replace(/[,\s]/g, ""));
const inputCls = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-navy-900";
const labelCls = "block text-xs font-bold uppercase tracking-wide text-slate-500";

const adjust = (p1: number, t1: number, t2: number) => p1 * ((t2 + R0) / (t1 + R0));

const TEMPS = [90, 70, 50, 30, 10];

export function TempPressureCalculator() {
  const [pText, setPText] = useState("65");
  const [t1Text, setT1Text] = useState("75");
  const [t2Text, setT2Text] = useState("30");

  const p1 = num(pText), t1 = num(t1Text), t2 = num(t2Text);
  const valid = p1 >= 10 && p1 <= 150 && t1 >= -30 && t1 <= 130 && t2 >= -30 && t2 <= 130;
  const p2 = valid ? adjust(p1, t1, t2) : 0;
  const delta = valid ? p2 - p1 : 0;
  const pctLow = valid && delta < 0 ? (Math.abs(delta) / p1) * 100 : 0;

  return (
    // translate="no"/notranslate: page-translator extensions rewrite DOM text
    // and crash React updates — keep the interactive widget untouched
    <div translate="no" className="notranslate">
      <div className="rounded-2xl border-2 border-brand p-5">
        <div className="grid grid-cols-3 gap-3 sm:max-w-lg">
          <div>
            <label className={labelCls} htmlFor="tp-p">Pressure set (PSI)</label>
            <input id="tp-p" inputMode="decimal" value={pText} onChange={(e) => setPText(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="tp-t1">…at temp (°F)</label>
            <input id="tp-t1" inputMode="numeric" value={t1Text} onChange={(e) => setT1Text(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="tp-t2">New temp (°F)</label>
            <input id="tp-t2" inputMode="numeric" value={t2Text} onChange={(e) => setT2Text(e.target.value)} className={inputCls} />
          </div>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          Cold pressures — measure before driving. Example preset: an ST trailer tire aired to 65 PSI in a 75°F summer
          garage, checked on a 30°F morning.
        </p>
      </div>

      {valid ? (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-steel-100 p-5 text-center">
              <div className="text-xs font-bold uppercase tracking-wide text-steel-500">Cold pressure at {t2}°F</div>
              <div className="mt-1 font-display text-3xl font-bold text-navy-900">{p2.toFixed(1)} PSI</div>
            </div>
            <div className="rounded-2xl bg-steel-100 p-5 text-center">
              <div className="text-xs font-bold uppercase tracking-wide text-steel-500">Change</div>
              <div className={`mt-1 font-display text-3xl font-bold ${delta < 0 ? "text-red-600" : "text-emerald-700"}`}>
                {delta >= 0 ? "+" : ""}{delta.toFixed(1)} PSI
              </div>
            </div>
            <div className="rounded-2xl bg-navy-900 p-5 text-center text-white">
              <div className="text-xs font-bold uppercase tracking-wide text-brand-light">Rule of thumb</div>
              <div className="mt-1 font-display text-2xl font-bold text-brand">~{(p1 * 0.019).toFixed(1)} PSI / 10°F</div>
              <div className="text-xs text-steel-300">at your pressure (≈2% per 10°F)</div>
            </div>
          </div>

          {pctLow >= 5 && (
            <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
              <span className="font-bold">That&apos;s {pctLow.toFixed(0)}% under your set pressure.</span> Underinflation
              builds heat — the number-one killer of trailer tires — and wears shoulders fast. Top up to the placard or
              sidewall pressure at the colder temperature.
            </p>
          )}

          <h2 className="mt-7 text-base font-bold">Your {p1.toFixed(0)} PSI (set at {t1}°F) across the seasons</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full max-w-xl border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border border-slate-300 bg-slate-50 px-3 py-2 text-left font-bold">Ambient</th>
                  {TEMPS.map((t) => <th key={t} className="border border-slate-300 bg-slate-50 px-3 py-2 font-bold tabular-nums">{t}°F</th>)}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-slate-300 px-3 py-2 font-semibold text-slate-600">Cold PSI</td>
                  {TEMPS.map((t) => (
                    <td key={t} className="border border-slate-300 px-3 py-2 text-center tabular-nums">{adjust(p1, t1, t).toFixed(1)}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">
          Enter a pressure (10–150 PSI) and temperatures between −30 and 130°F.
        </p>
      )}

      <div className="mt-6 rounded-xl border border-slate-200 p-4 text-sm text-slate-600">
        <span className="font-bold text-navy-900">Habits that save tires:</span> check pressures monthly and before
        every trip, always cold (before driving or 3+ hours parked). Trailer tires run at the{" "}
        <b>max pressure molded on the sidewall</b> unless the trailer maker says otherwise — and a fall temperature drop
        is the classic cause of a &quot;mystery&quot; underinflation blowout.
      </div>

      <div className="mt-6 rounded-2xl bg-navy-900 p-6 text-white">
        <h2 className="h-display text-2xl">Tires taking a beating?</h2>
        <p className="mt-2 text-sm text-steel-300">
          Heat-worn trailer tires don&apos;t announce themselves. Check the tread and the date code, then let us sort the
          replacement.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/tools/tread-depth-guide" className="btn-gold">Check Tread Depth</Link>
          <Link href="/tools/dot-date-decoder" className="btn-ghost-dark">Decode Tire Age</Link>
          <Link href="/quote" className="btn-ghost-dark">Dealer Quote</Link>
        </div>
      </div>
    </div>
  );
}
