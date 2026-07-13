"use client";

import { useState } from "react";
import Link from "next/link";

const TABS = ["Size", "Brand", "Category", "Application"] as const;
type Tab = (typeof TABS)[number];

const CATEGORIES = [
  ["ST Trailer", "/tires/st-trailer"],
  ["Passenger", "/tires/passenger"],
  ["Light Truck", "/tires/light-truck"],
  ["Commercial", "/tires/commercial-truck"],
  ["Wheels", "/wheels"],
  ["Parts", "/parts"],
] as const;

const APPLICATIONS = [
  ["Boat / Utility Trailer", "/tires/st-trailer"],
  ["Gooseneck / Equipment", "/tires/st-trailer"],
  ["Passenger / Touring", "/tires/passenger"],
  ["Pickup / 4x4", "/tires/light-truck"],
  ["Regional Haul / Fleet", "/tires/commercial-truck"],
  ["Custom Wheels", "/wheels"],
] as const;

const chip = "rounded-lg border border-steel-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-navy-900 transition hover:border-brand hover:text-brand-dark";

/** One-tap searches for the sizes dealers ask for most. */
const POPULAR_SIZES = ["ST205/75R15", "ST225/75R15", "ST235/80R16", "225/65R17", "11R22.5"];

/**
 * Multi-path tire search: size / brand / category / application (spec §6).
 * The forms are native GET forms (uncontrolled inputs) on purpose: they keep
 * working even when hydration is broken by browser extensions such as page
 * translators — a real dealer-desktop scenario. Only the tab switcher needs JS.
 */
export function TireSearch() {
  const [tab, setTab] = useState<Tab>("Size");

  return (
    <div className="rounded-2xl bg-white p-4 shadow-lift sm:p-5">
      <div className="flex flex-wrap gap-1 border-b border-steel-200" role="tablist" aria-label="Search tires by">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`-mb-px rounded-t-lg px-4 py-2 text-sm font-bold transition ${tab === t ? "border-b-2 border-brand text-navy-900" : "text-steel-500 hover:text-navy-800"}`}>
            {t}
          </button>
        ))}
      </div>
      <div className="pt-4">
        {tab === "Size" && (
          <div>
            <form action="/tires" method="get" className="flex gap-2">
              <label htmlFor="ts-size" className="sr-only">Tire size</label>
              {/* text-navy-900 is load-bearing: the hero section is text-white and
                  preflight makes inputs inherit color — white-on-white otherwise */}
              <input id="ts-size" name="q" autoComplete="off"
                placeholder='Type a size any way — "ST225/75R15", "2256517", "33X12.50R20"'
                className="w-full rounded-lg border border-steel-300 px-4 py-3 text-sm text-navy-900" />
              <button className="btn-gold shrink-0">Search</button>
            </form>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-steel-500">Popular:</span>
              {POPULAR_SIZES.map((s) => (
                <Link key={s} href={`/tires?q=${encodeURIComponent(s)}`}
                  className="rounded-md bg-steel-100 px-2 py-1 text-xs font-semibold text-navy-800 transition hover:bg-brand/20 hover:text-navy-900">
                  {s}
                </Link>
              ))}
            </div>
          </div>
        )}
        {tab === "Brand" && (
          <form action="/tires" method="get" className="flex gap-2">
            <label htmlFor="ts-brand" className="sr-only">Brand</label>
            <input id="ts-brand" name="q" autoComplete="off"
              placeholder='e.g. "Transeagle", "Kapsen", "Haida"'
              className="w-full rounded-lg border border-steel-300 px-4 py-3 text-sm text-navy-900" />
            <button className="btn-gold shrink-0">Search</button>
          </form>
        )}
        {tab === "Category" && (
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(([label, href]) => (
              <Link key={label} href={href} className={chip}>{label}</Link>
            ))}
          </div>
        )}
        {tab === "Application" && (
          <div className="flex flex-wrap gap-2">
            {APPLICATIONS.map(([label, href]) => (
              <Link key={label} href={href} className={chip}>{label}</Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
