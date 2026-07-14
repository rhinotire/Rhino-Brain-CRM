"use client";

import { useState } from "react";
import Link from "next/link";
import { calcTrailerLoad, HITCH_SHARE, LOAD_INDEX_TABLE, type HitchType } from "@/lib/trailer-load";

const lbs = (n: number) => n.toLocaleString("en-US");

export function TrailerLoadCalculator() {
  const [gvwrText, setGvwrText] = useState("7000");
  const [axles, setAxles] = useState(2);
  const [hitch, setHitch] = useState<HitchType>("bumper");

  const gvwr = Number(gvwrText.replace(/[,\s]/g, ""));
  const result = calcTrailerLoad(gvwr, axles, hitch);

  return (
    // translate="no"/notranslate: page-translator extensions rewrite DOM text
    // and crash React updates — keep the interactive widget untouched
    <div translate="no" className="notranslate">
      {/* inputs */}
      <div className="grid gap-4 rounded-2xl border-2 border-brand p-5 sm:grid-cols-3">
        <div>
          <label htmlFor="tl-gvwr" className="block text-xs font-bold uppercase tracking-wide text-slate-500">
            Trailer GVWR (lbs)
          </label>
          <input id="tl-gvwr" inputMode="numeric" value={gvwrText} onChange={(e) => setGvwrText(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-navy-900" />
          <p className="mt-1 text-[11px] text-slate-500">On the trailer&apos;s VIN plate. Use loaded weight if you know it.</p>
        </div>
        <div>
          <label htmlFor="tl-axles" className="block text-xs font-bold uppercase tracking-wide text-slate-500">Axles</label>
          <select id="tl-axles" value={axles} onChange={(e) => setAxles(+e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-navy-900">
            <option value={1}>Single axle (2 tires)</option>
            <option value={2}>Tandem axle (4 tires)</option>
            <option value={3}>Triple axle (6 tires)</option>
          </select>
        </div>
        <div>
          <label htmlFor="tl-hitch" className="block text-xs font-bold uppercase tracking-wide text-slate-500">Hitch type</label>
          <select id="tl-hitch" value={hitch} onChange={(e) => setHitch(e.target.value as HitchType)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-navy-900">
            {Object.entries(HITCH_SHARE).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-slate-500">{HITCH_SHARE[hitch].note}</p>
        </div>
      </div>

      {/* results */}
      {result ? (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-steel-100 p-5 text-center">
              <div className="text-xs font-bold uppercase tracking-wide text-steel-500">Weight on trailer tires</div>
              <div className="mt-1 font-display text-3xl font-bold text-navy-900">{lbs(result.loadOnTires)} lbs</div>
              <div className="text-xs text-steel-500">across {result.tires} tires</div>
            </div>
            <div className="rounded-2xl bg-steel-100 p-5 text-center">
              <div className="text-xs font-bold uppercase tracking-wide text-steel-500">Bare minimum per tire</div>
              <div className="mt-1 font-display text-3xl font-bold text-navy-900">{lbs(result.perTireMin)} lbs</div>
              <div className="text-xs text-steel-500">capacity at max cold PSI</div>
            </div>
            <div className="rounded-2xl bg-navy-900 p-5 text-center text-white">
              <div className="text-xs font-bold uppercase tracking-wide text-brand-light">Recommended per tire</div>
              <div className="mt-1 font-display text-3xl font-bold text-brand">{lbs(result.perTireRecommended)} lbs+</div>
              <div className="text-xs text-steel-300">with a {result.reservePct}% heat reserve</div>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">
            <span className="font-bold">What to look for:</span> a tire with a max-load stamp of{" "}
            <span className="font-bold">{lbs(result.perTireRecommended)} lbs or more</span>
            {result.loadIndexNeeded && (
              <> — that&apos;s load index <span className="font-bold">{result.loadIndexNeeded}</span> ({lbs(result.loadIndexLbs!)} lbs) or higher</>
            )}
            . The capacity and load range (C / D / E…) are molded into every tire&apos;s sidewall — always verify there.
          </div>
        </>
      ) : (
        <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">
          Enter a trailer weight between 500 and 60,000 lbs.
        </p>
      )}

      {/* load index reference */}
      <details className="mt-6 rounded-xl border border-slate-200 p-4">
        <summary className="cursor-pointer text-sm font-bold text-navy-900">Load index → pounds reference table</summary>
        <div className="mt-3 grid grid-cols-2 gap-x-6 text-sm sm:grid-cols-4">
          {LOAD_INDEX_TABLE.map((r) => (
            <div key={r.li} className="flex justify-between border-b border-slate-100 py-1 tabular-nums">
              <span className="font-semibold text-slate-600">{r.li}</span>
              <span>{lbs(r.lbs)} lbs</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">Per-tire capacity at maximum cold inflation pressure (industry standard table).</p>
      </details>

      <div className="mt-6 rounded-2xl bg-navy-900 p-6 text-white">
        <h2 className="h-display text-2xl">Need trailer tires that carry it?</h2>
        <p className="mt-2 text-sm text-steel-300">
          Tell us your size and the capacity above — we&apos;ll quote ST trailer tires from our Orlando and Dallas stock at
          dealer pricing.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/tires/st-trailer" className="btn-gold">Browse Trailer Tires</Link>
          <Link href="/quote" className="btn-ghost-dark">Request a Quote</Link>
        </div>
      </div>
    </div>
  );
}
