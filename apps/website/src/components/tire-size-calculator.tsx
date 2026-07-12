"use client";

import { useState } from "react";
import {
  calcTire, diameterDiffPct, actualSpeed, parseTireSize,
  COMMON_WIDTHS, COMMON_ASPECTS, COMMON_RIMS, type TireSpec,
} from "@/lib/tire-math";

const sel = "rounded-lg border border-slate-300 bg-white px-2 py-2.5 text-sm";

function TirePicker({ label, tire, onChange, accent }: { label: string; tire: TireSpec; onChange: (t: TireSpec) => void; accent: boolean }) {
  const [text, setText] = useState("");
  return (
    <div className={`rounded-2xl border-2 p-4 ${accent ? "border-brand" : "border-slate-300"}`}>
      <div className={`text-sm font-bold uppercase tracking-wide ${accent ? "text-brand-dark" : "text-slate-500"}`}>{label}</div>
      <div className="mt-3 flex items-end gap-2">
        <div>
          <label className="block text-xs font-semibold text-slate-500" htmlFor={`${label}-w`}>Width</label>
          <select id={`${label}-w`} className={sel} value={tire.width} onChange={(e) => onChange({ ...tire, width: +e.target.value })}>
            {COMMON_WIDTHS.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
        </div>
        <span className="pb-2 font-bold text-slate-400">/</span>
        <div>
          <label className="block text-xs font-semibold text-slate-500" htmlFor={`${label}-a`}>Aspect</label>
          <select id={`${label}-a`} className={sel} value={tire.aspect} onChange={(e) => onChange({ ...tire, aspect: +e.target.value })}>
            {COMMON_ASPECTS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <span className="pb-2 font-bold text-slate-400">R</span>
        <div>
          <label className="block text-xs font-semibold text-slate-500" htmlFor={`${label}-r`}>Rim</label>
          <select id={`${label}-r`} className={sel} value={tire.rim} onChange={(e) => onChange({ ...tire, rim: +e.target.value })}>
            {COMMON_RIMS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>
      <div className="mt-3">
        <label className="block text-xs font-semibold text-slate-500" htmlFor={`${label}-q`}>…or type a size</label>
        <input
          id={`${label}-q`}
          value={text}
          placeholder='e.g. "ST235/80R16"'
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          onChange={(e) => {
            setText(e.target.value);
            const parsed = parseTireSize(e.target.value);
            if (parsed) onChange(parsed);
          }}
        />
      </div>
    </div>
  );
}

const fmt = (n: number, d = 2) => n.toFixed(d);

export function TireSizeCalculator() {
  const [a, setA] = useState<TireSpec>({ width: 205, aspect: 75, rim: 15 });
  const [b, setB] = useState<TireSpec>({ width: 235, aspect: 80, rim: 16 });
  const ca = calcTire(a);
  const cb = calcTire(b);
  const diff = diameterDiffPct(ca, cb);
  const warn = Math.abs(diff) > 3;
  const label = (t: TireSpec) => `${t.width}/${t.aspect}R${t.rim}`;

  const rows: [string, number, number, number][] = [
    ["Overall diameter (in)", ca.diameterIn, cb.diameterIn, 2],
    ["Section width (in)", ca.widthIn, cb.widthIn, 2],
    ["Sidewall height (in)", ca.sidewallIn, cb.sidewallIn, 2],
    ["Circumference (in)", ca.circumferenceIn, cb.circumferenceIn, 1],
    ["Revolutions per mile", ca.revsPerMile, cb.revsPerMile, 0],
  ];

  // visual: two circles scaled to the larger diameter
  const maxD = Math.max(ca.diameterIn, cb.diameterIn);
  const scale = 130 / maxD;

  return (
    <div>
      <div className="grid gap-4 sm:grid--cols-2 sm:grid-cols-2">
        <TirePicker label="Current tire" tire={a} onChange={setA} accent={false} />
        <TirePicker label="New tire" tire={b} onChange={setB} accent />
      </div>

      <div className={`mt-5 rounded-xl p-4 text-sm font-semibold ${warn ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>
        {label(b)} is {fmt(Math.abs(diff), 1)}% {diff >= 0 ? "larger" : "smaller"} in diameter than {label(a)}.
        {warn
          ? " ⚠ More than 3% — expect noticeable speedometer error and possible clearance issues. Check fitment carefully."
          : " Within the ±3% rule of thumb — generally acceptable."}
      </div>

      <div className="mt-6 grid items-start gap-6 md:grid-cols-[1fr_280px]">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border border-slate-300 bg-slate-50 px-3 py-2 text-left font-bold">Measurement</th>
                <th className="border border-slate-300 bg-slate-50 px-3 py-2 text-left font-bold">{label(a)}</th>
                <th className="border border-slate-300 bg-brand/10 px-3 py-2 text-left font-bold">{label(b)}</th>
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

          <h3 className="mt-6 font-bold">Speedometer error</h3>
          <p className="mt-1 text-xs text-slate-500">If your speedometer was calibrated for {label(a)} and you install {label(b)}:</p>
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

        {/* visual comparison */}
        <svg viewBox="0 0 300 170" className="mx-auto w-full max-w-[300px]" aria-label="Visual size comparison">
          <circle cx={80} cy={160 - ca.diameterIn * scale / 2} r={ca.diameterIn * scale / 2} fill="none" stroke="#334155" strokeWidth="8" />
          <circle cx={80} cy={160 - ca.diameterIn * scale / 2} r={(a.rim * scale) / 2} fill="none" stroke="#94a3b8" strokeWidth="3" />
          <circle cx={210} cy={160 - cb.diameterIn * scale / 2} r={cb.diameterIn * scale / 2} fill="none" stroke="#e5a50a" strokeWidth="8" />
          <circle cx={210} cy={160 - cb.diameterIn * scale / 2} r={(b.rim * scale) / 2} fill="none" stroke="#d4a017" strokeWidth="3" />
          <text x={80} y={166} textAnchor="middle" fontSize="10" fill="#64748b" fontWeight="bold">{label(a)}</text>
          <text x={210} y={166} textAnchor="middle" fontSize="10" fill="#b8850a" fontWeight="bold">{label(b)}</text>
        </svg>
      </div>
    </div>
  );
}
