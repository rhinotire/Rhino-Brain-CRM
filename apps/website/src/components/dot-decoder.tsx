"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * DOT date-code decoder. The last four digits of the DOT code are week +
 * two-digit year (e.g. 3523 = week 35 of 2023). Age guidance follows the
 * widely-published industry consensus (5-year inspections, ~6–10 year
 * service-life ceiling, stricter for trailer tires) — with a "have it
 * inspected" disclaimer, never a safety guarantee.
 */

type Decoded =
  | { ok: true; week: number; year: number; date: Date; ageYears: number }
  | { ok: false; reason: "pre2000" | "invalid" | "future" };

function decodeDot(raw: string): Decoded | null {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!cleaned) return null;
  // take trailing digits of the full code
  const m = cleaned.match(/(\d{3,4})$/);
  if (!m) return cleaned.length >= 4 ? { ok: false, reason: "invalid" } : null;
  if (m[1].length === 3) return { ok: false, reason: "pre2000" };
  const week = Number(m[1].slice(0, 2));
  const yy = Number(m[1].slice(2));
  if (week < 1 || week > 53) return { ok: false, reason: "invalid" };
  const year = 2000 + yy;
  const now = new Date();
  if (year > now.getFullYear()) return { ok: false, reason: "future" };
  // approximate date: Jan 1 + (week-1) weeks
  const date = new Date(year, 0, 1 + (week - 1) * 7);
  if (date > now) return { ok: false, reason: "future" };
  const ageYears = (now.getTime() - date.getTime()) / (365.25 * 24 * 3600 * 1000);
  return { ok: true, week, year, date, ageYears };
}

function verdict(age: number): { color: string; title: string; body: string } {
  if (age < 5)
    return {
      color: "bg-emerald-50 text-emerald-900",
      title: "Within normal service age",
      body: "Keep an eye on tread depth and pressure, and have the tires looked over during regular service. Trailer tires: inspect for sidewall cracking every season — sun and sitting age them faster than miles.",
    };
  if (age < 6)
    return {
      color: "bg-amber-50 text-amber-900",
      title: "5+ years — inspection time",
      body: "Industry guidance calls for a professional inspection every year from age 5. For trailer tires this is planning-to-replace territory: heat and UV aging, not tread wear, is what ends their life.",
    };
  if (age < 10)
    return {
      color: "bg-orange-50 text-orange-900",
      title: "6–10 years — plan replacement",
      body: "Many tire and vehicle manufacturers recommend replacement in this window regardless of tread depth. For trailer tires, running past 6 years is a known blowout risk — replace them.",
    };
  return {
    color: "bg-red-50 text-red-900",
    title: "Over 10 years — replace now",
    body: "The industry consensus is that tires more than 10 years old should be replaced regardless of appearance or remaining tread. Rubber degrades from the inside out — age you can't see is still age.",
  };
}

const EXAMPLES = ["3523", "1219", "0816", "4924"];

export function DotDecoder() {
  const [text, setText] = useState("");
  const decoded = decodeDot(text);
  const v = decoded?.ok ? verdict(decoded.ageYears) : null;
  const monthYear = decoded?.ok
    ? decoded.date.toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : null;

  return (
    // translate="no"/notranslate: page-translator extensions rewrite DOM text
    // and crash React updates — keep the interactive widget untouched
    <div translate="no" className="notranslate">
      <div className="rounded-2xl border-2 border-brand p-5">
        <label htmlFor="dot-code" className="block text-xs font-bold uppercase tracking-wide text-slate-500">
          Last 4 digits of the DOT code (or paste the whole thing)
        </label>
        <input id="dot-code" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off"
          placeholder='e.g. "3523" — or "DOT U2LL LMLR 3523"'
          className="mt-1 w-full max-w-md rounded-lg border border-slate-300 px-4 py-3 text-sm text-navy-900" />
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

      {decoded && (
        decoded.ok ? (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-steel-100 p-5 text-center">
                <div className="text-xs font-bold uppercase tracking-wide text-steel-500">Manufactured</div>
                <div className="mt-1 font-display text-2xl font-bold text-navy-900">{monthYear}</div>
                <div className="text-xs text-steel-500">week {decoded.week} of {decoded.year}</div>
              </div>
              <div className="rounded-2xl bg-steel-100 p-5 text-center">
                <div className="text-xs font-bold uppercase tracking-wide text-steel-500">Tire age</div>
                <div className="mt-1 font-display text-2xl font-bold text-navy-900">{decoded.ageYears.toFixed(1)} years</div>
                <div className="text-xs text-steel-500">as of today</div>
              </div>
              <div className="rounded-2xl bg-navy-900 p-5 text-center text-white">
                <div className="text-xs font-bold uppercase tracking-wide text-brand-light">Status</div>
                <div className="mt-1 font-display text-2xl font-bold text-brand">{v!.title}</div>
              </div>
            </div>
            <p className={`mt-4 rounded-xl p-4 text-sm ${v!.color}`}>{v!.body}</p>
          </>
        ) : (
          <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">
            {decoded.reason === "pre2000" &&
              "A 3-digit date code means the tire was made before the year 2000 — it is far past its service life. Replace it."}
            {decoded.reason === "invalid" &&
              "That doesn't decode — the date is the LAST 4 digits of the DOT code: week (01–53) + year. Example: 3523 = week 35 of 2023."}
            {decoded.reason === "future" &&
              "That decodes to a future date — double-check the digits. The date code is the last 4 characters, digits only."}
          </p>
        )
      )}

      <div className="mt-6 rounded-xl border border-slate-200 p-4 text-sm text-slate-600">
        <span className="font-bold text-navy-900">Where to find it:</span> on the sidewall, look for letters starting
        with <span className="font-mono font-bold">DOT</span> followed by plant and size codes — the date is the final
        4-digit group (some sidewalls only show the full code on one side of the tire).
        <div className="mt-2 rounded-lg bg-steel-100 p-3 text-center font-mono text-base tracking-widest text-steel-500">
          DOT&nbsp;U2LL&nbsp;LMLR&nbsp;<span className="rounded bg-brand px-1.5 font-bold text-navy-900">3523</span>
        </div>
      </div>

      <p className="mt-4 max-w-2xl text-xs text-steel-500">
        Age guidance reflects widely-published industry recommendations, not a substitute for a hands-on inspection —
        damage, weather-cracking or poor storage can end a tire&apos;s life much earlier.
      </p>

      <div className="mt-6 rounded-2xl bg-navy-900 p-6 text-white">
        <h2 className="h-display text-2xl">Time for fresh tires?</h2>
        <p className="mt-2 text-sm text-steel-300">
          Consumers: we&apos;ll route you to professional installation near you. Dealers: wholesale pricing on fresh-date
          stock from Orlando and Dallas.
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
