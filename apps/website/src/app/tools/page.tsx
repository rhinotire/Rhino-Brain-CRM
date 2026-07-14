import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Tire Tools & Calculators",
  description: "Free tire tools from a wholesale distributor: tire size comparison calculator, speedometer error, and more coming.",
  alternates: { canonical: "/tools" },
};

const TOOLS = [
  {
    href: "/tools/trailer-load-calculator",
    name: "Trailer Tire Load Calculator",
    blurb: "GVWR + axles + hitch type → the per-tire capacity and load index you need, with the 20% heat reserve.",
  },
  {
    href: "/tools/tire-size-calculator",
    name: "Tire Size Calculator & Comparison",
    blurb: "Compare two sizes: diameter, sidewall, revs per mile, speedometer error — with a visual.",
  },
  {
    href: "/tools/bolt-pattern-guide",
    name: "Bolt Pattern Guide & Calculator",
    blurb: "How to measure lug patterns (even and 5-lug), an exact calculator, and the standard trailer patterns.",
  },
  {
    href: "/tools/tire-size-converter",
    name: "Metric ↔ Inch Size Converter",
    blurb: "33X12.50R20 in metric? Real dimensions plus the closest standard equivalents on your rim.",
  },
  {
    href: "/tools/cost-per-mile-calculator",
    name: "Tire Cost per Mile Calculator",
    blurb: "Price ÷ tread life — the number fleets buy on. Compare two tires and see the annual fleet impact.",
  },
  {
    href: "/tools/dot-date-decoder",
    name: "DOT Date Code Decoder",
    blurb: "How old are your tires? Decode the sidewall date stamp and get industry age guidance.",
  },
  {
    href: "/tools/gear-ratio-calculator",
    name: "Gear Ratio & RPM Calculator",
    blurb: "Bigger tires? See your new cruise RPM, effective gearing, and the re-gear that restores stock feel.",
  },
];

export default function ToolsPage() {
  return (
    <div className="pt-8">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
        <Link href="/">Home</Link> / Tools
      </nav>
      <h1 className="mt-2 text-2xl font-black">Tire Tools &amp; Calculators</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">Free, no sign-up. Built by our wholesale team.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {TOOLS.map((t) => (
          <Link key={t.href} href={t.href} className="rounded-xl border border-slate-200 p-6 hover:border-brand">
            <div className="text-lg font-bold">{t.name}</div>
            <p className="mt-2 text-sm text-slate-600">{t.blurb}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
