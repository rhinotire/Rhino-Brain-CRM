"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * Tread depth guide: depth in 32nds → status tier + % of usable tread left
 * ((current − 2) / (new − 2), since 2/32 is the legal floor), with the penny
 * and quarter tests and the FMCSA commercial minimums. All thresholds are
 * published industry/federal standards.
 */

const num = (t: string) => Number(t.replace(/[,\s]/g, ""));
const inputCls = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-navy-900";
const labelCls = "block text-xs font-bold uppercase tracking-wide text-slate-500";

function tier(d: number): { color: string; chip: string; title: string; body: string } {
  if (d <= 2)
    return {
      color: "bg-red-50 text-red-900", chip: "#dc2626",
      title: "Worn out — replace now",
      body: "2/32\" is the federal legal minimum — the built-in wear bars are flush with the tread at this point. Wet traction is largely gone and hydroplaning risk is severe.",
    };
  if (d <= 4)
    return {
      color: "bg-orange-50 text-orange-900", chip: "#ea580c",
      title: "Replace soon",
      body: "Wet braking distances grow dramatically below 4/32\". This is also the FMCSA minimum for commercial steer tires. If the quarter test shows Washington's full head, you're here.",
    };
  if (d <= 5)
    return {
      color: "bg-amber-50 text-amber-900", chip: "#d97706",
      title: "Monitor closely",
      body: "Still legal, but plan the replacement — especially before a rainy season or a long trip. Check pressure and rotate so the last 32nds wear evenly.",
    };
  return {
    color: "bg-emerald-50 text-emerald-900", chip: "#059669",
    title: "Healthy tread",
    body: "Plenty of usable depth. Keep pressures right, rotate on schedule, and re-check with a coin every few months.",
  };
}

/** Depth ruler with colored zones and a marker at the current depth. */
function DepthRuler({ depth, newDepth }: { depth: number; newDepth: number }) {
  const W = 340, H = 96;
  const max = Math.max(newDepth, 12);
  const x = (d: number) => 18 + (d / max) * (W - 36);
  const zones: [number, number, string][] = [
    [0, 2, "#dc2626"], [2, 4, "#ea580c"], [4, 6, "#f0a500"], [6, max, "#059669"],
  ];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[380px]" aria-hidden="true">
      {zones.map(([a, b, c]) => (
        <rect key={a} x={x(a)} y={34} width={x(b) - x(a)} height={18} fill={c} rx={2} />
      ))}
      {[0, 2, 4, 6, 8, 10, 12].filter((t) => t <= max).map((t) => (
        <g key={t}>
          <line x1={x(t)} y1={52} x2={x(t)} y2={58} stroke="#64748b" strokeWidth={1} />
          <text x={x(t)} y={70} textAnchor="middle" fontSize={9.5} fontWeight={600} fill="#64748b">{t}/32</text>
        </g>
      ))}
      {/* marker */}
      <g transform={`translate(${x(Math.min(depth, max))} 0)`}>
        <path d="M 0 30 L -6 18 L 6 18 Z" fill="#0c1b33" />
        <text x={0} y={14} textAnchor="middle" fontSize={11} fontWeight={800} fill="#0c1b33">{depth}/32&quot;</text>
      </g>
      <text x={x(1)} y={90} textAnchor="middle" fontSize={8.5} fontWeight={700} fill="#dc2626">ILLEGAL</text>
      <text x={x(3)} y={90} textAnchor="middle" fontSize={8.5} fontWeight={700} fill="#ea580c">REPLACE</text>
      <text x={x(5)} y={90} textAnchor="middle" fontSize={8.5} fontWeight={700} fill="#b45309">MONITOR</text>
      <text x={x(Math.min(max - 1.5, 9))} y={90} textAnchor="middle" fontSize={8.5} fontWeight={700} fill="#059669">GOOD</text>
    </svg>
  );
}

export function TreadDepthGuide() {
  const [depthText, setDepthText] = useState("6");
  const [newText, setNewText] = useState("11");
  const depth = num(depthText);
  const newDepth = num(newText);
  const valid = depth >= 0 && depth <= 26 && newDepth >= 6 && newDepth <= 26 && newDepth > 2;
  const t = valid ? tier(depth) : null;
  const remaining = valid ? Math.max(0, Math.min(100, ((depth - 2) / (newDepth - 2)) * 100)) : 0;

  return (
    // translate="no"/notranslate: page-translator extensions rewrite DOM text
    // and crash React updates — keep the interactive widget untouched
    <div translate="no" className="notranslate">
      <div className="grid gap-5 rounded-2xl border-2 border-brand p-5 md:grid-cols-[260px_1fr]">
        <div>
          <div>
            <label className={labelCls} htmlFor="td-depth">Measured depth (32nds)</label>
            <input id="td-depth" inputMode="numeric" value={depthText} onChange={(e) => setDepthText(e.target.value)} className={inputCls} />
            <p className="mt-1 text-[11px] text-slate-500">Use a $2 depth gauge, or the coin tests below</p>
          </div>
          <div className="mt-3">
            <label className={labelCls} htmlFor="td-new">Depth when new (32nds)</label>
            <input id="td-new" inputMode="numeric" value={newText} onChange={(e) => setNewText(e.target.value)} className={inputCls} />
            <p className="mt-1 text-[11px] text-slate-500">Typical: 10–12 highway · 13–17 AT/MT · check the spec sheet</p>
          </div>
        </div>
        <div className="text-center">
          {valid ? (
            <>
              <DepthRuler depth={depth} newDepth={newDepth} />
              <div className="mx-auto mt-2 max-w-sm">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-semibold text-steel-500">Usable tread remaining</span>
                  <span className="font-display text-2xl font-bold text-navy-900">{remaining.toFixed(0)}%</span>
                </div>
                <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-steel-200">
                  <div className="h-full rounded-full" style={{ width: `${remaining}%`, background: t!.chip }} />
                </div>
                <p className="mt-1 text-left text-[11px] text-steel-500">Counting only depth above the 2/32&quot; legal floor.</p>
              </div>
            </>
          ) : (
            <p className="rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">
              Enter your measured depth (0–26) and the tread depth when new (6–26).
            </p>
          )}
        </div>
      </div>

      {t && <p className={`mt-4 rounded-xl p-4 text-sm ${t.color}`}><span className="font-bold">{t.title}.</span> {t.body}</p>}

      {/* coin tests */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-steel-200 bg-white p-5 shadow-card">
          <div className="font-display text-lg font-bold uppercase text-navy-900">The Penny Test — 2/32&quot;</div>
          <p className="mt-2 text-sm text-steel-500">
            Put a penny into the groove, <b>Lincoln&apos;s head down</b>. If you can see the <b>top of his head</b>, the
            tread is at or below 2/32&quot; — the tire is legally worn out. Test several grooves across the tire.
          </p>
        </div>
        <div className="rounded-2xl border border-steel-200 bg-white p-5 shadow-card">
          <div className="font-display text-lg font-bold uppercase text-navy-900">The Quarter Test — 4/32&quot;</div>
          <p className="mt-2 text-sm text-steel-500">
            Same move with a quarter, <b>Washington&apos;s head down</b>. See the top of his head? You&apos;re at about
            4/32&quot; — time to start shopping, and the wet-weather safety margin is already thin.
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 p-4 text-sm text-slate-600">
        <span className="font-bold text-navy-900">Commercial (FMCSA) minimums:</span> steer tires 4/32&quot;, all other
        positions 2/32&quot; — measured in a major groove. Trailer tires usually age out before they wear out:{" "}
        <Link href="/tools/dot-date-decoder" className="font-bold text-brand-dark">check the date code too →</Link>
      </div>

      <div className="mt-6 rounded-2xl bg-navy-900 p-6 text-white">
        <h2 className="h-display text-2xl">Tread&apos;s done? Sort it today.</h2>
        <p className="mt-2 text-sm text-steel-300">
          Consumers: professional installation near you. Dealers: wholesale replacement stock from Orlando and Dallas.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/find-installation" className="btn-gold">Find Installation Near Me</Link>
          <Link href="/tires" className="btn-ghost-dark">Browse Tires</Link>
          <Link href="/quote" className="btn-ghost-dark">Dealer Quote</Link>
        </div>
      </div>
    </div>
  );
}
