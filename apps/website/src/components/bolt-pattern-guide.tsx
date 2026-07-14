"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * Bolt pattern (lug pattern) guide: how to measure, an adjacent-hole
 * calculator (BCD = spacing / sin(π/n) — pure geometry), and the standard
 * trailer patterns. All figures are industry-standard published values.
 */

const COMMON_PATTERNS: { pattern: string; mm: string; seenOn: string }[] = [
  { pattern: "4 x 4\"", mm: "4 x 101.6", seenOn: "Small boat & utility trailers" },
  { pattern: "5 x 4.5\"", mm: "5 x 114.3", seenOn: "The most common trailer pattern (\"5 on 4½\"); most cars & many SUVs" },
  { pattern: "5 x 4.75\"", mm: "5 x 120.65", seenOn: "Many GM cars" },
  { pattern: "5 x 5\"", mm: "5 x 127", seenOn: "Some trailers; classic GM trucks & SUVs" },
  { pattern: "5 x 5.5\"", mm: "5 x 139.7", seenOn: "Heavier single-axle trailers; classic Ford trucks" },
  { pattern: "6 x 5.5\"", mm: "6 x 139.7", seenOn: "Tandem-axle trailers; GM & Toyota trucks" },
  { pattern: "8 x 6.5\"", mm: "8 x 165.1", seenOn: "Heavy tandem/triple-axle trailers; HD pickups" },
];

/** BCD from adjacent-hole spacing: spacing / sin(π/n). */
const MULTIPLIER: Record<number, number> = { 4: 1.4142, 5: 1.7013, 6: 2.0, 8: 2.6131 };

/** Inch BCDs of the common patterns, for nearest-match display. */
const KNOWN_BCD: { lugs: number; bcd: number; label: string }[] = [
  { lugs: 4, bcd: 4, label: "4 x 4\" (4 x 101.6 mm)" },
  { lugs: 5, bcd: 4.5, label: "5 x 4.5\" (5 x 114.3 mm)" },
  { lugs: 5, bcd: 4.75, label: "5 x 4.75\" (5 x 120.65 mm)" },
  { lugs: 5, bcd: 5, label: "5 x 5\" (5 x 127 mm)" },
  { lugs: 5, bcd: 5.5, label: "5 x 5.5\" (5 x 139.7 mm)" },
  { lugs: 6, bcd: 5.5, label: "6 x 5.5\" (6 x 139.7 mm)" },
  { lugs: 8, bcd: 6.5, label: "8 x 6.5\" (8 x 165.1 mm)" },
];

/** Wheel-face diagram with n lug holes; even patterns measure straight across, 5-lug uses the shop method. */
function LugDiagram({ n }: { n: 5 | 6 }) {
  const R = 78; // bolt circle radius in px
  const cx = 110, cy = 110;
  const holes = Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), i };
  });
  const holeR = 11;
  return (
    <svg viewBox="0 0 220 236" className="w-full max-w-[240px]" aria-hidden="true">
      <circle cx={cx} cy={cy} r={100} fill="#f1f5f9" stroke="#94a3b8" strokeWidth={2} />
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="#cbd5e1" strokeWidth={1.2} strokeDasharray="4 3" />
      <circle cx={cx} cy={cy} r={30} fill="#e2e8f0" stroke="#94a3b8" strokeWidth={1.5} />
      {holes.map((h) => (
        <circle key={h.i} cx={h.x} cy={h.y} r={holeR} fill="#ffffff" stroke="#475569" strokeWidth={2} />
      ))}
      {n === 6 ? (
        <g stroke="#c98a00" strokeWidth={2}>
          <line x1={holes[0].x} y1={holes[0].y} x2={holes[3].x} y2={holes[3].y} />
          <circle cx={holes[0].x} cy={holes[0].y} r={3} fill="#c98a00" stroke="none" />
          <circle cx={holes[3].x} cy={holes[3].y} r={3} fill="#c98a00" stroke="none" />
        </g>
      ) : (
        (() => {
          // 5-lug shop method: center of one hole → far EDGE of the skip-one hole
          const from = holes[0];
          const to = holes[2];
          const dx = to.x - from.x, dy = to.y - from.y;
          const len = Math.hypot(dx, dy);
          const ex = to.x + (dx / len) * holeR, ey = to.y + (dy / len) * holeR;
          return (
            <g stroke="#c98a00" strokeWidth={2}>
              <line x1={from.x} y1={from.y} x2={ex} y2={ey} />
              <circle cx={from.x} cy={from.y} r={3} fill="#c98a00" stroke="none" />
              <circle cx={ex} cy={ey} r={3} fill="#c98a00" stroke="none" />
            </g>
          );
        })()
      )}
      <text x={cx} y={228} textAnchor="middle" fontSize={11} fontWeight={700} fill="#334155">
        {n === 6 ? "Center to center, straight across" : "Center → far edge, two holes over"}
      </text>
    </svg>
  );
}

export function BoltPatternGuide() {
  const [lugs, setLugs] = useState(5);
  const [spacingText, setSpacingText] = useState("2.64");
  const spacing = Number(spacingText);
  const valid = Number.isFinite(spacing) && spacing > 1 && spacing < 12;
  const bcd = valid ? spacing * MULTIPLIER[lugs] : null;
  const match = bcd ? KNOWN_BCD.find((k) => k.lugs === lugs && Math.abs(k.bcd - bcd) <= 0.15) : null;

  return (
    // translate="no"/notranslate: page-translator extensions rewrite DOM text
    // and crash React updates — keep the interactive widget untouched
    <div translate="no" className="notranslate">
      {/* how to measure */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-steel-200 bg-white p-5 text-center shadow-card">
          <LugDiagram n={6} />
          <p className="mt-2 text-sm text-steel-500">
            <span className="font-bold text-navy-900">4, 6 or 8 lugs:</span> measure from the <b>center</b> of one hole
            to the <b>center</b> of the hole directly across. That&apos;s your bolt circle.
          </p>
        </div>
        <div className="rounded-2xl border border-steel-200 bg-white p-5 text-center shadow-card">
          <LugDiagram n={5} />
          <p className="mt-2 text-sm text-steel-500">
            <span className="font-bold text-navy-900">5 lugs</span> have no hole directly across — measure from the{" "}
            <b>center</b> of one hole to the <b>far edge</b> of the hole two positions over, or use the exact calculator
            below.
          </p>
        </div>
      </div>

      {/* exact calculator */}
      <div className="mt-6 rounded-2xl border-2 border-brand p-5">
        <h2 className="text-base font-bold">Exact method — measure two neighboring holes</h2>
        <p className="mt-1 text-sm text-steel-500">
          Measure center-to-center between two holes <b>next to each other</b> (easiest to do accurately), pick your lug
          count, and geometry does the rest.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="bp-lugs" className="block text-xs font-bold uppercase tracking-wide text-slate-500">Lug count</label>
            <select id="bp-lugs" value={lugs} onChange={(e) => setLugs(+e.target.value)}
              className="mt-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-navy-900">
              {[4, 5, 6, 8].map((n) => <option key={n} value={n}>{n} lug</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="bp-spacing" className="block text-xs font-bold uppercase tracking-wide text-slate-500">
              Neighbor spacing (inches)
            </label>
            <input id="bp-spacing" inputMode="decimal" value={spacingText} onChange={(e) => setSpacingText(e.target.value)}
              className="mt-1 w-36 rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-navy-900" />
          </div>
          <div className="rounded-xl bg-navy-900 px-5 py-3 text-white">
            {bcd ? (
              <>
                <span className="text-xs uppercase tracking-wide text-steel-300">Bolt circle ≈ </span>
                <span className="font-display text-2xl font-bold text-brand">{bcd.toFixed(2)}&quot;</span>
                <span className="text-xs text-steel-300"> ({(bcd * 25.4).toFixed(1)} mm)</span>
              </>
            ) : (
              <span className="text-sm text-steel-300">Enter a spacing between 1&quot; and 12&quot;</span>
            )}
          </div>
        </div>
        {match && (
          <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-900">
            That&apos;s the standard <span className="font-bold">{match.label}</span> pattern.
          </p>
        )}
        {bcd && !match && (
          <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            No standard trailer pattern within ⅛&quot; — re-measure carefully, or call us with the number and we&apos;ll
            identify it.
          </p>
        )}
      </div>

      {/* common patterns table */}
      <h2 className="mt-8 text-base font-bold">Common trailer bolt patterns</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border border-slate-300 bg-slate-50 px-3 py-2 text-left font-bold">Pattern (inches)</th>
              <th className="border border-slate-300 bg-slate-50 px-3 py-2 text-left font-bold">Metric (mm)</th>
              <th className="border border-slate-300 bg-slate-50 px-3 py-2 text-left font-bold">Typically seen on</th>
            </tr>
          </thead>
          <tbody>
            {COMMON_PATTERNS.map((p) => (
              <tr key={p.pattern}>
                <td className="border border-slate-300 px-3 py-2 font-bold text-navy-900">{p.pattern}</td>
                <td className="border border-slate-300 px-3 py-2 tabular-nums">{p.mm}</td>
                <td className="border border-slate-300 px-3 py-2 text-slate-600">{p.seenOn}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-8 rounded-2xl bg-navy-900 p-6 text-white">
        <h2 className="h-display text-2xl">Know your pattern? We stock the wheel.</h2>
        <p className="mt-2 text-sm text-steel-300">
          Spoke, mod and galvanized trailer wheels in 4, 5, 6 and 8 lug — by the piece, pallet or container.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/wheels" className="btn-gold">Browse Trailer Wheels</Link>
          <Link href="/packages" className="btn-ghost-dark">Tire &amp; Wheel Packages</Link>
          <Link href="/quote" className="btn-ghost-dark">Request a Quote</Link>
        </div>
      </div>
    </div>
  );
}
