"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * Wheel offset ↔ backspacing converter with a live cross-section diagram.
 * Standard shop formulas (overall width ≈ bead width + 1" for the flanges):
 *   backspacing = (width + 1) / 2 + offset/25.4
 *   offset(mm)  = (backspacing − (width + 1) / 2) × 25.4
 */

const WIDTHS = [5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 11, 12, 13, 14];

const num = (t: string) => Number(t.replace(/[,\s]/g, ""));
const inputCls = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-navy-900";
const labelCls = "block text-xs font-bold uppercase tracking-wide text-slate-500";

const bsFromOffset = (width: number, offsetMm: number) => (width + 1) / 2 + offsetMm / 25.4;
const offsetFromBs = (width: number, bs: number) => (bs - (width + 1) / 2) * 25.4;

/** Live cross-section: barrel, flanges, centerline, mounting face. */
function CrossSection({ width, offsetMm }: { width: number; offsetMm: number }) {
  const overall = width + 1;
  const S = Math.min(24, 250 / overall); // px per inch
  const W = 340, H = 230;
  const cx = W / 2;
  const barrelW = overall * S;
  const x0 = cx - barrelW / 2, x1 = cx + barrelW / 2; // back (brake side) … street side
  const top = 46, bot = 168;
  const bs = bsFromOffset(width, offsetMm);
  const faceX = x0 + bs * S;
  const positive = offsetMm >= 0;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[380px]" aria-label="Wheel cross-section diagram">
      {/* barrel */}
      <rect x={x0} y={top} width={barrelW} height={bot - top} rx={6} fill="#e2e8f0" stroke="#94a3b8" strokeWidth={1.5} />
      {/* flanges */}
      <rect x={x0 - 3} y={top - 8} width={10} height={bot - top + 16} rx={3} fill="#94a3b8" />
      <rect x={x1 - 7} y={top - 8} width={10} height={bot - top + 16} rx={3} fill="#94a3b8" />
      <text x={x0} y={top - 14} textAnchor="middle" fontSize={10} fontWeight={700} fill="#64748b">BRAKE SIDE</text>
      <text x={x1} y={top - 14} textAnchor="middle" fontSize={10} fontWeight={700} fill="#64748b">STREET SIDE</text>
      {/* centerline */}
      <line x1={cx} y1={top - 6} x2={cx} y2={bot + 6} stroke="#64748b" strokeWidth={1.2} strokeDasharray="5 4" />
      <text x={cx} y={bot + 18} textAnchor="middle" fontSize={9.5} fontWeight={600} fill="#64748b">CENTERLINE</text>
      {/* mounting face */}
      <line x1={faceX} y1={top + 4} x2={faceX} y2={bot - 4} stroke={positive ? "#c98a00" : "#dc2626"} strokeWidth={4} strokeLinecap="round" />
      <text x={faceX} y={top + 20} textAnchor={faceX > cx ? "end" : "start"} dx={faceX > cx ? -8 : 8} fontSize={10} fontWeight={700} fill={positive ? "#8f6400" : "#dc2626"}>
        HUB FACE
      </text>
      {/* backspacing dimension: back flange → face */}
      <g stroke="#334155" strokeWidth={1.2}>
        <line x1={x0 - 3} y1={bot - 24} x2={faceX} y2={bot - 24} />
        <line x1={x0 - 3} y1={bot - 30} x2={x0 - 3} y2={bot - 18} />
        <line x1={faceX} y1={bot - 30} x2={faceX} y2={bot - 18} />
      </g>
      <text x={(x0 + faceX) / 2} y={bot - 30} textAnchor="middle" fontSize={11} fontWeight={700} fill="#334155"
        stroke="#ffffff" strokeWidth={3} paintOrder="stroke">
        {`backspacing ${bs.toFixed(2)}"`}
      </text>
      {/* offset dimension: centerline → face */}
      {Math.abs(offsetMm) > 1 && (
        <>
          <g stroke={positive ? "#c98a00" : "#dc2626"} strokeWidth={1.2}>
            <line x1={cx} y1={top + 34} x2={faceX} y2={top + 34} />
            <line x1={faceX} y1={top + 28} x2={faceX} y2={top + 40} />
          </g>
          <text x={(cx + faceX) / 2} y={top + 30} textAnchor="middle" fontSize={11} fontWeight={700}
            fill={positive ? "#8f6400" : "#dc2626"} stroke="#ffffff" strokeWidth={3} paintOrder="stroke">
            {`${offsetMm >= 0 ? "+" : ""}${Math.round(offsetMm)} mm`}
          </text>
        </>
      )}
    </svg>
  );
}

export function OffsetBackspacing() {
  const [widthText, setWidthText] = useState("8");
  const [offsetText, setOffsetText] = useState("0");
  const [bsText, setBsText] = useState(bsFromOffset(8, 0).toFixed(2));

  const width = num(widthText);
  const widthOk = width >= 4 && width <= 15;
  const offset = num(offsetText);
  const bs = num(bsText);
  const valid = widthOk && Number.isFinite(offset) && Math.abs(offset) <= 80 && Number.isFinite(bs);

  const setWidth = (w: string) => {
    setWidthText(w);
    const wn = num(w);
    if (wn >= 4 && wn <= 15 && Number.isFinite(offset)) setBsText(bsFromOffset(wn, offset).toFixed(2));
  };
  const setOffset = (v: string) => {
    setOffsetText(v);
    const o = num(v);
    if (widthOk && Number.isFinite(o) && Math.abs(o) <= 80) setBsText(bsFromOffset(width, o).toFixed(2));
  };
  const setBs = (v: string) => {
    setBsText(v);
    const b = num(v);
    if (widthOk && Number.isFinite(b) && b > 0 && b < 15) setOffsetText(String(Math.round(offsetFromBs(width, b))));
  };

  const frontspace = valid ? width + 1 - bs : 0;

  return (
    // translate="no"/notranslate: page-translator extensions rewrite DOM text
    // and crash React updates — keep the interactive widget untouched
    <div translate="no" className="notranslate">
      <div className="grid gap-5 rounded-2xl border-2 border-brand p-5 md:grid-cols-[300px_1fr]">
        <div>
          <div>
            <label className={labelCls} htmlFor="ob-width">Wheel width (inches)</label>
            <select id="ob-width" value={widthText} onChange={(e) => setWidth(e.target.value)} className={inputCls}>
              {WIDTHS.map((w) => <option key={w} value={w}>{w}&quot;</option>)}
            </select>
            <p className="mt-1 text-[11px] text-slate-500">Bead-seat width, e.g. the 6 in 15X6</p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="ob-offset">Offset (mm)</label>
              <input id="ob-offset" inputMode="numeric" value={offsetText} onChange={(e) => setOffset(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls} htmlFor="ob-bs">Backspacing (in)</label>
              <input id="ob-bs" inputMode="decimal" value={bsText} onChange={(e) => setBs(e.target.value)} className={inputCls} />
            </div>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">Edit either one — the other updates.</p>
          {valid && (
            <div className="mt-4 rounded-xl bg-steel-100 p-4 text-sm">
              <div className="flex justify-between"><span className="font-semibold text-steel-500">Frontspacing</span><span className="font-bold tabular-nums">{frontspace.toFixed(2)}&quot;</span></div>
              <div className="mt-1 flex justify-between"><span className="font-semibold text-steel-500">Stance</span>
                <span className="font-bold">{offset > 5 ? "tucked in" : offset < -5 ? "pokes out" : "near centered"}</span>
              </div>
            </div>
          )}
        </div>
        <div className="text-center">
          {valid ? <CrossSection width={width} offsetMm={offset} /> : (
            <p className="rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">
              Enter a width 4–15&quot; and an offset within ±80 mm.
            </p>
          )}
          <p className="mx-auto mt-1 max-w-md text-xs text-steel-500">
            <span className="font-bold text-brand-dark">Positive offset</span> = hub face toward the street side (wheel
            tucks in). <span className="font-bold text-red-600">Negative</span> = face toward the brakes (wheel pokes
            out, deep dish).
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 p-4 text-sm text-slate-600">
        <span className="font-bold text-navy-900">Rules of thumb:</span> most trailer wheels run <b>zero offset</b>{" "}
        (backspacing = half the overall width). Staying within about <b>±5 mm of your stock offset</b> keeps steering
        and bearing loads happy; big negative offsets widen the stance but add leverage on bearings and can rub fenders.
        Always confirm brake-caliper clearance on the backspacing side.
      </div>

      <div className="mt-6 rounded-2xl bg-navy-900 p-6 text-white">
        <h2 className="h-display text-2xl">Picking wheels? We&apos;ll match the fitment.</h2>
        <p className="mt-2 text-sm text-steel-300">
          Give us bolt pattern, width and offset or backspacing — we&apos;ll quote steel and custom wheels from stock.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/wheels" className="btn-gold">Browse Wheels</Link>
          <Link href="/tools/bolt-pattern-guide" className="btn-ghost-dark">Bolt Pattern Guide</Link>
          <Link href="/quote" className="btn-ghost-dark">Request a Quote</Link>
        </div>
      </div>
    </div>
  );
}
