"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

/** Multi-path tire search: size / brand / category / application (spec §6). */
export function TireSearch() {
  const [tab, setTab] = useState<Tab>("Size");
  const [q, setQ] = useState("");
  const router = useRouter();
  const go = (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim()) router.push(`/tires?q=${encodeURIComponent(q.trim())}`);
  };

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
          <form onSubmit={go} className="flex gap-2">
            <label htmlFor="ts-size" className="sr-only">Tire size</label>
            <input id="ts-size" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off"
              placeholder='e.g. "ST235/80R16", "2055516", "33X12.50R20"'
              className="w-full rounded-lg border border-steel-300 px-4 py-3 text-sm" />
            <button className="btn-gold shrink-0">Search</button>
          </form>
        )}
        {tab === "Brand" && (
          <form onSubmit={go} className="flex gap-2">
            <label htmlFor="ts-brand" className="sr-only">Brand</label>
            <input id="ts-brand" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off"
              placeholder='e.g. "Transeagle", "Kapsen", "Haida"'
              className="w-full rounded-lg border border-steel-300 px-4 py-3 text-sm" />
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
