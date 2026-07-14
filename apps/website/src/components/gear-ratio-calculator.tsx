"use client";

import { useState } from "react";
import Link from "next/link";
import { calcTire, parseTireSize, formatTireSize } from "@/lib/tire-math";

/**
 * Gear ratio / RPM calculator for tire size changes. Standard driveline math:
 * RPM = mph × axle ratio × trans ratio × 336.13 / tire diameter (in).
 * Bigger tires lower effective gearing; the re-gear recommendation restores
 * the stock RPM: needed ratio = axle × newDiameter / oldDiameter.
 */

const RPM_K = 336.13; // (5280 ft × 12 in) / (60 min × π)
const COMMON_RATIOS = [3.08, 3.21, 3.42, 3.55, 3.73, 3.92, 4.10, 4.30, 4.56, 4.88, 5.13, 5.29];
const SPEEDS = [55, 65, 70, 75];

const num = (t: string) => Number(t.replace(/[,\s]/g, ""));
const fmt0 = (n: number) => Math.round(n).toLocaleString("en-US");

const inputCls = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-navy-900";
const labelCls = "block text-xs font-bold uppercase tracking-wide text-slate-500";

function TireInput({ id, label, value, onChange, fallbackRim }: {
  id: string; label: string; value: string; onChange: (v: string) => void; fallbackRim: number;
}) {
  const parsed = parseTireSize(value, fallbackRim);
  const bad = value.trim().length >= 6 && !parsed;
  return (
    <div>
      <label className={labelCls} htmlFor={id}>{label}</label>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} autoComplete="off"
        className={`${inputCls} ${bad ? "!border-red-400" : ""}`} placeholder='"265/70R17" · "35X12.50R20"' />
      <p className="mt-1 text-[11px] text-slate-500">
        {parsed ? `${formatTireSize(parsed)} — ${calcTire(parsed).diameterIn.toFixed(1)}" tall` : "any format, digits work too"}
      </p>
    </div>
  );
}

export function GearRatioCalculator() {
  const [oldTire, setOldTire] = useState("265/70R17");
  const [newTire, setNewTire] = useState("35X12.50R20");
  const [axleText, setAxleText] = useState("3.73");
  const [transText, setTransText] = useState("0.70");
  const [speedText, setSpeedText] = useState("65");

  const po = parseTireSize(oldTire, 17);
  const pn = parseTireSize(newTire, 20);
  const axle = num(axleText), trans = num(transText), speed = num(speedText);
  const inputsOk = po && pn && axle > 1 && axle < 8 && trans > 0.3 && trans < 3 && speed >= 20 && speed <= 120;

  if (!inputsOk) {
    return (
      <GearShell oldTire={oldTire} newTire={newTire} axleText={axleText} transText={transText} speedText={speedText}
        setOldTire={setOldTire} setNewTire={setNewTire} setAxleText={setAxleText} setTransText={setTransText} setSpeedText={setSpeedText}>
        <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">
          Enter two valid tire sizes, an axle ratio (e.g. 3.73), a top-gear ratio (e.g. 0.70 — use 1.00 for no
          overdrive), and a cruise speed.
        </p>
      </GearShell>
    );
  }

  const dOld = calcTire(po).diameterIn;
  const dNew = calcTire(pn).diameterIn;
  const rpm = (mph: number, d: number, ratio: number) => (mph * ratio * trans * RPM_K) / d;
  const rpmOld = rpm(speed, dOld, axle);
  const rpmNew = rpm(speed, dNew, axle);
  const effRatio = axle * (dOld / dNew);
  const neededRatio = axle * (dNew / dOld);
  const sameTire = Math.abs(dNew - dOld) < 0.05;
  // closest common ratios around the needed one
  const regear = [...COMMON_RATIOS]
    .sort((a, b) => Math.abs(a - neededRatio) - Math.abs(b - neededRatio))
    .slice(0, 3)
    .sort((a, b) => a - b);

  return (
    <GearShell oldTire={oldTire} newTire={newTire} axleText={axleText} transText={transText} speedText={speedText}
      setOldTire={setOldTire} setNewTire={setNewTire} setAxleText={setAxleText} setTransText={setTransText} setSpeedText={setSpeedText}>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-steel-100 p-5 text-center">
          <div className="text-xs font-bold uppercase tracking-wide text-steel-500">RPM @ {speed} mph — before</div>
          <div className="mt-1 font-display text-3xl font-bold text-navy-900">{fmt0(rpmOld)}</div>
          <div className="text-xs text-steel-500">{dOld.toFixed(1)}&quot; tire · {axle.toFixed(2)} gears</div>
        </div>
        <div className="rounded-2xl bg-steel-100 p-5 text-center">
          <div className="text-xs font-bold uppercase tracking-wide text-steel-500">RPM @ {speed} mph — after</div>
          <div className="mt-1 font-display text-3xl font-bold text-navy-900">{fmt0(rpmNew)}</div>
          <div className="text-xs text-steel-500">{dNew.toFixed(1)}&quot; tire · same gears</div>
        </div>
        <div className="rounded-2xl bg-navy-900 p-5 text-center text-white">
          <div className="text-xs font-bold uppercase tracking-wide text-brand-light">Effective gearing</div>
          <div className="mt-1 font-display text-3xl font-bold text-brand">{effRatio.toFixed(2)}</div>
          <div className="text-xs text-steel-300">feels like this ratio now</div>
        </div>
      </div>

      {!sameTire && (
        <div className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">
          <span className="font-bold">To get back to stock feel:</span> you need about{" "}
          <span className="font-bold">{neededRatio.toFixed(2)}</span> gears. Closest common ratios:{" "}
          {regear.map((r, i) => (
            <span key={r}>
              {i > 0 && " · "}
              <span className={`font-bold ${Math.abs(r - neededRatio) === Math.min(...regear.map((x) => Math.abs(x - neededRatio))) ? "underline decoration-2" : ""}`}>
                {r.toFixed(2)}
              </span>
              <span className="text-emerald-700"> ({fmt0(rpm(speed, dNew, r))} RPM)</span>
            </span>
          ))}
          . Going taller than stock hurts acceleration and towing; most people re-gear slightly deeper.
        </div>
      )}

      <h2 className="mt-7 text-base font-bold">Cruise RPM at highway speeds</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full max-w-2xl border-collapse text-sm">
          <thead>
            <tr>
              <th className="border border-slate-300 bg-slate-50 px-3 py-2 text-left font-bold">Setup</th>
              {SPEEDS.map((s) => <th key={s} className="border border-slate-300 bg-slate-50 px-3 py-2 font-bold tabular-nums">{s} mph</th>)}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-slate-300 px-3 py-2 font-semibold text-slate-600">{dOld.toFixed(1)}&quot; tire · {axle.toFixed(2)}</td>
              {SPEEDS.map((s) => <td key={s} className="border border-slate-300 px-3 py-2 text-center tabular-nums">{fmt0(rpm(s, dOld, axle))}</td>)}
            </tr>
            <tr className="bg-brand/5">
              <td className="border border-slate-300 px-3 py-2 font-semibold text-slate-600">{dNew.toFixed(1)}&quot; tire · {axle.toFixed(2)}</td>
              {SPEEDS.map((s) => <td key={s} className="border border-slate-300 px-3 py-2 text-center tabular-nums">{fmt0(rpm(s, dNew, axle))}</td>)}
            </tr>
            {!sameTire && (
              <tr className="bg-emerald-50">
                <td className="border border-slate-300 px-3 py-2 font-semibold text-slate-600">{dNew.toFixed(1)}&quot; tire · {regear[Math.min(1, regear.length - 1)].toFixed(2)} re-gear</td>
                {SPEEDS.map((s) => <td key={s} className="border border-slate-300 px-3 py-2 text-center tabular-nums">{fmt0(rpm(s, dNew, regear[Math.min(1, regear.length - 1)]))}</td>)}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 max-w-2xl text-xs text-steel-500">
        Top-gear (overdrive) ratio varies by transmission — check yours; 0.70 is a typical overdrive, 1.00 means direct
        drive. Speedometer and odometer will also read off after a size change —{" "}
        <Link href="/tools/tire-size-calculator" className="font-bold text-brand-dark">see exactly how much →</Link>
      </p>

      <div className="mt-6 rounded-2xl bg-navy-900 p-6 text-white">
        <h2 className="h-display text-2xl">Going bigger? We stock the tires.</h2>
        <p className="mt-2 text-sm text-steel-300">
          33s, 35s and 37s in all-terrain, rugged-terrain and mud-terrain — wholesale pricing by the set, pallet or
          container.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/tires/light-truck" className="btn-gold">Browse Light Truck Tires</Link>
          <Link href="/quote" className="btn-ghost-dark">Request a Quote</Link>
        </div>
      </div>
    </GearShell>
  );
}

/** Shared input shell so the error state keeps the form visible. */
function GearShell({ children, oldTire, newTire, axleText, transText, speedText, setOldTire, setNewTire, setAxleText, setTransText, setSpeedText }: {
  children: React.ReactNode;
  oldTire: string; newTire: string; axleText: string; transText: string; speedText: string;
  setOldTire: (v: string) => void; setNewTire: (v: string) => void; setAxleText: (v: string) => void;
  setTransText: (v: string) => void; setSpeedText: (v: string) => void;
}) {
  return (
    // translate="no"/notranslate: page-translator extensions rewrite DOM text
    // and crash React updates — keep the interactive widget untouched
    <div translate="no" className="notranslate">
      <div className="rounded-2xl border-2 border-brand p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <TireInput id="gr-old" label="Current / stock tire" value={oldTire} onChange={setOldTire} fallbackRim={17} />
          <TireInput id="gr-new" label="New tire" value={newTire} onChange={setNewTire} fallbackRim={20} />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 sm:max-w-lg">
          <div>
            <label className={labelCls} htmlFor="gr-axle">Axle ratio</label>
            <input id="gr-axle" inputMode="decimal" value={axleText} onChange={(e) => setAxleText(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="gr-trans">Top-gear ratio</label>
            <input id="gr-trans" inputMode="decimal" value={transText} onChange={(e) => setTransText(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="gr-speed">Cruise speed (mph)</label>
            <input id="gr-speed" inputMode="numeric" value={speedText} onChange={(e) => setSpeedText(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-steel-500">Common axle ratios:</span>
          {["3.42", "3.55", "3.73", "4.10", "4.30", "4.56", "4.88"].map((r) => (
            <button key={r} type="button" onClick={() => setAxleText(r)}
              className="rounded-md bg-steel-100 px-2 py-1 text-xs font-semibold text-navy-800 transition hover:bg-brand/20">
              {r}
            </button>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}
