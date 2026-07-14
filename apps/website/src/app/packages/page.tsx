import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Tire & Wheel Packages — Mounted Trailer Assemblies",
  description:
    "Pre-mounted tire and wheel packages: trailer assemblies on spoke, mod and galvanized wheels, ready to bolt on. Wholesale pricing for dealers and trailer manufacturers.",
  alternates: { canonical: "/packages" },
};

const POPULAR_ASSEMBLIES = [
  ["ST205/75R14 on 14X5.5 (5-lug)", "/tires?q=ST205/75R14"],
  ["ST205/75R15 on 15X6 (5-lug)", "/tires?q=ST205/75R15"],
  ["ST225/75R15 on 15X6 (6-lug)", "/tires?q=ST225/75R15"],
  ["ST235/80R16 on 16X6 (8-lug)", "/tires?q=ST235/80R16"],
] as const;

export default function PackagesPage() {
  return (
    <div className="pt-8">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
        <Link href="/">Home</Link> / Tire &amp; Wheel Packages
      </nav>
      <h1 className="mt-2 text-2xl font-black">Tire &amp; Wheel Packages</h1>
      <p className="mt-2 max-w-2xl text-sm text-steel-500">
        Pre-mounted, balanced assemblies ready to bolt on — the biggest labor saver for trailer manufacturers and
        dealers. Spoke, mod and galvanized wheels in white, black and silver.
      </p>

      <form action="/tires" method="get" className="mt-4 flex max-w-lg gap-2">
        <label htmlFor="pkg-q" className="sr-only">Search assemblies by tire size</label>
        <input id="pkg-q" name="q" autoComplete="off"
          placeholder='Search assemblies by tire size — "ST205/75R15", "2057515"'
          className="w-full rounded-lg border border-steel-300 px-4 py-3 text-sm text-navy-900" />
        <button className="btn-gold shrink-0">Search</button>
      </form>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {POPULAR_ASSEMBLIES.map(([label, href]) => (
          <Link key={label} href={href}
            className="rounded-2xl border border-steel-200 bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:border-brand hover:shadow-lift">
            <div className="font-display text-lg font-bold uppercase text-navy-900">{label}</div>
            <div className="mt-1 text-xs text-steel-500">See live stock →</div>
          </Link>
        ))}
      </div>

      <div className="mt-8 rounded-2xl bg-navy-900 p-7 text-white shadow-card">
        <h2 className="h-display text-2xl">Assembly programs for volume buyers</h2>
        <p className="mt-2 max-w-2xl text-sm text-steel-300">
          Tell us the tire size, wheel style, bolt pattern and monthly volume — we&apos;ll quote mounted assemblies by the
          pallet or container, with mixed loads available.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/quote" className="btn-gold">Request Assembly Quote</Link>
          <a href={`tel:${SITE.phone}`} className="btn-ghost-dark">Call {SITE.phoneDisplay}</a>
        </div>
      </div>
    </div>
  );
}
