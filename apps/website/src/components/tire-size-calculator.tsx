"use client";

import { useState } from "react";
import {
  calcTire, diameterDiffPct, actualSpeed, parseTireSize, formatTireSize,
  COMMON_WIDTHS, COMMON_ASPECTS, COMMON_RIMS, FLOT_DIAMETERS, FLOT_WIDTHS, FLOT_RIMS, type TireSpec,
} from "@/lib/tire-math";
import { TireCompareVisual } from "@/components/tire-compare-visual";

const sel = "rounded-lg border border-slate-300 bg-white px-2 py-2.5 text-sm";

function TirePicker({ label, tire, onChange, accent }: { label: string; tire: TireSpec; onChange: (t: TireSpec) => void; accent: boolean }) {
  const [text, setText] = useState("");
  const [badInput, setBadInput] = useState(false);
  const metric = tire.kind === "metric" ? tire : null;
  const flot = tire.kind === "flotation" ? tire : null;

  return (
    <div className={`rounded-2xl border-2 p-4 ${accent ? "border-brand" : "border-slate-300"}`}>
      <div className={`text-sm font-bold uppercase tracking-wide ${accent ? "text-brand-dark" : "text-slate-500"}`}>
        {label} <span className="ml-1 normal-case text-steel-500">— {formatTireSize(tire)}</span>
      </div>

      {/* sizing-system tabs */}
      <div className="mt-3 inline-flex rounded-lg border border-slate-200 p-0.5 text-xs font-bold">
        <button type="button"
          className={`rounded-md px-3 py-1.5 ${metric ? "bg-ink text-white" : "text-slate-500"}`}
          onClick={() => !metric && onChange({ kind: "metric", width: 235, aspect: 80, rim: 16 })}>
          Metric (235/80R16)
        </button>
        <button type="button"
          className={`rounded-md px-3 py-1.5 ${flot ? "bg-ink text-white" : "text-slate-500"}`}
          onClick={() => !flot && onChange({ kind: "flotation", diameterIn: 33, widthIn: 12.5, rim: 20 })}>
          Off-Road (33X12.50R20)
        </button>
      </div>

      {metric ? (
        <div className="mt-3 flex items-end gap-2">
          <div>
            <label className="block text-xs font-semibold text-slate-500" htmlFor={`${label}-w`}>Width</label>
            <select id={`${label}-w`} className={sel} value={metric.width} onChange={(e) => onChange({ ...metric, width: +e.target.value })}>
              {COMMON_WIDTHS.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          <span className="pb-2 font-bold text-slate-400">/</span>
          <div>
            <label className="block text-xs font-semibold text-slate-500" htmlFor={`${label}-a`}>Aspect</label>
            <select id={`${label}-a`} className={sel} value={metric.aspect} onChange={(e) => onChange({ ...metric, aspect: +e.target.value })}>
              {COMMON_ASPECTS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <span className="pb-2 font-bold text-slate-400">R</span>
          <div>
            <label className="block text-xs font-semibold text-slate-500" htmlFor={`${label}-r`}>Rim</label>
            <select id={`${label}-r`} className={sel} value={metric.rim} onChange={(e) => onChange({ ...metric, rim: +e.target.value })}>
              {COMMON_RIMS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>
      ) : flot ? (
        <div className="mt-3 flex items-end gap-2">
          <div>
            <label className="block text-xs font-semibold text-slate-500" htmlFor={`${label}-fd`}>Diameter</label>
            <select id={`${label}-fd`} className={sel} value={flot.diameterIn} onChange={(e) => onChange({ ...flot, diameterIn: +e.target.value })}>
              {FLOT_DIAMETERS.map((d) => <option key={d} value={d}>{d}&quot;</option>)}
            </select>
          </div>
          <span className="pb-2 font-bold text-slate-400">X</span>
          <div>
            <label className="block text-xs font-semibold text-slate-500" htmlFor={`${label}-fw`}>Width</label>
            <select id={`${label}-fw`} className={sel} value={flot.widthIn} onChange={(e) => onChange({ ...flot, widthIn: +e.target.value })}>
              {FLOT_WIDTHS.map((w) => <option key={w} value={w}>{w}&quot;</option>)}
            </select>
          </div>
          <span className="pb-2 font-bold text-slate-400">R</span>
          <div>
            <label className="block text-xs font-semibold text-slate-500" htmlFor={`${label}-fr`}>Rim</label>
            <select id={`${label}-fr`} className={sel} value={flot.rim} onChange={(e) => onChange({ ...flot, rim: +e.target.value })}>
              {FLOT_RIMS.map((r) => <option key={r} value={r}>{r}&quot;</option>)}
            </select>
          </div>
        </div>
      ) : null}

      <div className="mt-3">
        <label className="block text-xs font-semibold text-slate-500" htmlFor={`${label}-q`}>…or type any size — digits work too</label>
        <input
          id={`${label}-q`}
          value={text}
          placeholder='"2055516" · "ST235/80R16" · "33125020"'
          className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${badInput ? "border-red-400" : "border-slate-300"}`}
          onChange={(e) => {
            setText(e.target.value);
            const parsed = parseTireSize(e.target.value, tire.rim);
            setBadInput(e.target.value.trim().length >= 6 && !parsed);
            if (parsed) onChange(parsed);
          }}
        />
      </div>
    </div>
  );
}

const fmt = (n: number, d = 2) => n.toFixed(d);

export function TireSizeCalculator({ initialA }: { initialA?: string }) {
  const [a, setA] = useState<TireSpec>(
    () => (initialA && parseTireSize(initialA)) || { kind: "metric", width: 205, aspect: 75, rim: 15 },
  );
  const [b, setB] = useState<TireSpec>({ kind: "metric", width: 235, aspect: 80, rim: 16 });
  const ca = calcTire(a);
  const cb = calcTire(b);
  const diff = diameterDiffPct(ca, cb);
  const warn = Math.abs(diff) > 3;

  const rows: [string, number, number, number][] = [
    ["Overall diameter (in)", ca.diameterIn, cb.diameterIn, 2],
    ["Section width (in)", ca.widthIn, cb.widthIn, 2],
    ["Sidewall height (in)", ca.sidewallIn, cb.sidewallIn, 2],
    ["Circumference (in)", ca.circumferenceIn, cb.circumferenceIn, 1],
    ["Revolutions per mile", ca.revsPerMile, cb.revsPerMile, 0],
  ];

  return (
    // translate="no"/notranslate: page-translator extensions rewrite DOM text
    // and crash React updates — keep the interactive widget untouched
    <div translate="no" className="notranslate">
      <div className="grid gap-4 sm:grid-cols-2">
        <TirePicker label="Current tire" tire={a} onChange={setA} accent={false} />
        <TirePicker label="New tire" tire={b} onChange={setB} accent />
      </div>

      <div className={`mt-5 rounded-xl p-4 text-sm font-semibold ${warn ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>
        {formatTireSize(b)} is {fmt(Math.abs(diff), 1)}% {diff >= 0 ? "larger" : "smaller"} in diameter than {formatTireSize(a)}.
        {warn
          ? " ⚠ More than 3% — expect noticeable speedometer error and possible clearance issues. Check fitment carefully."
          : " Within the ±3% rule of thumb — generally acceptable."}
      </div>

      <div className="mt-6">
        <TireCompareVisual ca={ca} cb={cb} rimA={a.rim} rimB={b.rim} la={formatTireSize(a)} lb={formatTireSize(b)} />
      </div>

      <div className="mt-6">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border border-slate-300 bg-slate-50 px-3 py-2 text-left font-bold">Measurement</th>
                <th className="border border-slate-300 bg-slate-50 px-3 py-2 text-left font-bold">{formatTireSize(a)}</th>
                <th className="border border-slate-300 bg-brand/10 px-3 py-2 text-left font-bold">{formatTireSize(b)}</th>
                <th className="border border-slate-300 bg-slate-50 px-3 py-2 text-left font-bold">Difference</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([name, va, vb, d]) => (
                <tr key={name}>
                  <td className="border border-slate-300 px-3 py-2 font-semibold text-slate-600">{name}</td>
                  <td className="border border-slate-300 px-3 py-2 tabular-nums">{fmt(va, d)}</td>
                  <td className="border border-slate-300 bg-brand/5 px-3 py-2 tabular-nums">{fmt(vb, d)}</td>
                  <td className="border border-slate-300 px-3 py-2 tabular-nums">
                    {vb - va >= 0 ? "+" : ""}{fmt(vb - va, d)} ({vb - va >= 0 ? "+" : ""}{fmt(((vb - va) / va) * 100, 1)}%)
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 className="mt-6 text-base font-bold">Speedometer error</h2>
          <p className="mt-1 text-xs text-slate-500">If your speedometer was calibrated for {formatTireSize(a)} and you install {formatTireSize(b)}:</p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border border-slate-300 bg-slate-50 px-3 py-2 text-left font-bold">Speedometer reads</th>
                  {[30, 45, 55, 65, 75].map((s) => <th key={s} className="border border-slate-300 bg-slate-50 px-3 py-2 font-bold tabular-nums">{s} mph</th>)}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-slate-300 px-3 py-2 font-semibold text-slate-600">Actual speed</td>
                  {[30, 45, 55, 65, 75].map((s) => (
                    <td key={s} className="border border-slate-300 px-3 py-2 tabular-nums">{fmt(actualSpeed(s, ca, cb), 1)}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
