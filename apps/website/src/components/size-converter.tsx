"use client";

import { useState } from "react";
import Link from "next/link";
import { calcTire, formatTireSize, parseTireSize, type TireSpec } from "@/lib/tire-math";
import { findEquivalents } from "@/lib/size-convert";

const fmt = (n: number, d = 2) => n.toFixed(d);
const signed = (n: number, d = 1) => `${n >= 0 ? "+" : ""}${n.toFixed(d)}`;

const EXAMPLES = ["33X12.50R20", "285/75R16", "35X12.50R20", "265/70R17", "37X13.50R24"];

export function SizeConverter() {
  const [text, setText] = useState("33X12.50R20");
  const parsed: TireSpec | null = parseTireSize(text, 20);
  const calc = parsed ? calcTire(parsed) : null;
  const equivalents = parsed ? findEquivalents(parsed) : [];
  const toSystem = parsed?.kind === "flotation" ? "metric" : "inch (flotation)";

  return (
    // translate="no"/notranslate: page-translator extensions rewrite DOM text
    // and crash React updates — keep the interactive widget untouched
    <div translate="no" className="notranslate">
      <div className="rounded-2xl border-2 border-brand p-5">
        <label htmlFor="cv-size" className="block text-xs font-bold uppercase tracking-wide text-slate-500">
          Enter a size in either system
        </label>
        <input id="cv-size" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off"
          placeholder='"33X12.50R20" · "285/75R16" · digits like "2857516"'
          className={`mt-1 w-full max-w-md rounded-lg border px-4 py-3 text-sm text-navy-900 ${text.trim().length >= 6 && !parsed ? "border-red-400" : "border-slate-300"}`} />
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-steel-500">Try:</span>
          {EXAMPLES.map((s) => (
            <button key={s} type="button" onClick={() => setText(s)}
              className="rounded-md bg-steel-100 px-2 py-1 text-xs font-semibold text-navy-800 transition hover:bg-brand/20">
              {s}
            </button>
          ))}
        </div>
      </div>

      {parsed && calc ? (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-steel-100 p-5 text-center">
              <div className="text-xs font-bold uppercase tracking-wide text-steel-500">Overall diameter</div>
              <div className="mt-1 font-display text-3xl font-bold text-navy-900">{fmt(calc.diameterIn, 1)}&quot;</div>
              <div className="text-xs text-steel-500">{fmt(calc.diameterMm, 0)} mm</div>
            </div>
            <div className="rounded-2xl bg-steel-100 p-5 text-center">
              <div className="text-xs font-bold uppercase tracking-wide text-steel-500">Section width</div>
              <div className="mt-1 font-display text-3xl font-bold text-navy-900">{fmt(calc.widthIn, 1)}&quot;</div>
              <div className="text-xs text-steel-500">{fmt(calc.widthIn * 25.4, 0)} mm</div>
            </div>
            <div className="rounded-2xl bg-steel-100 p-5 text-center">
              <div className="text-xs font-bold uppercase tracking-wide text-steel-500">Sidewall</div>
              <div className="mt-1 font-display text-3xl font-bold text-navy-900">{fmt(calc.sidewallIn, 1)}&quot;</div>
              <div className="text-xs text-steel-500">on a {parsed.rim}&quot; rim</div>
            </div>
          </div>

          <h2 className="mt-7 text-base font-bold">
            Closest {toSystem} equivalents <span className="font-normal text-steel-500">(same {parsed.rim}&quot; rim)</span>
          </h2>
          {equivalents.length ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full max-w-2xl border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="border border-slate-300 bg-slate-50 px-3 py-2 text-left font-bold">Size</th>
                    <th className="border border-slate-300 bg-slate-50 px-3 py-2 text-left font-bold">Diameter</th>
                    <th className="border border-slate-300 bg-slate-50 px-3 py-2 text-left font-bold">Width</th>
                    <th className="border border-slate-300 bg-slate-50 px-3 py-2 text-left font-bold">Diameter diff</th>
                  </tr>
                </thead>
                <tbody>
                  {equivalents.map((e, i) => (
                    <tr key={formatTireSize(e.spec)} className={i === 0 ? "bg-emerald-50" : ""}>
                      <td className="border border-slate-300 px-3 py-2 font-bold text-navy-900">
                        {formatTireSize(e.spec)}{i === 0 && <span className="ml-2 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">BEST MATCH</span>}
                      </td>
                      <td className="border border-slate-300 px-3 py-2 tabular-nums">{fmt(e.calc.diameterIn, 1)}&quot;</td>
                      <td className="border border-slate-300 px-3 py-2 tabular-nums">{fmt(e.calc.widthIn, 1)}&quot;</td>
                      <td className="border border-slate-300 px-3 py-2 tabular-nums">{signed(e.dDiffPct)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
              No standard size in the other system comes within 5% on a {parsed.rim}&quot; rim.
            </p>
          )}
          <p className="mt-3 max-w-2xl text-xs text-steel-500">
            &quot;Equivalent&quot; means closest overall diameter on the same rim — always stay within ±3% of your
            original diameter and check load rating and clearance before switching.{" "}
            <Link href="/tools/tire-size-calculator" className="font-bold text-brand-dark">Compare any two sizes in detail →</Link>
          </p>
        </>
      ) : (
        text.trim().length >= 6 && (
          <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">
            Couldn&apos;t read that size — try formats like 33X12.50R20 or 285/75R16.
          </p>
        )
      )}
    </div>
  );
}
