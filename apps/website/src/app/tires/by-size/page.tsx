import type { Metadata } from "next";
import Link from "next/link";
import { CATEGORY_SLUGS } from "@/lib/site";

export const metadata: Metadata = {
  title: "Search Tires by Size — Any Format Accepted",
  description:
    "Find wholesale tires by size: 225/65R17, ST235/80R16, 11R22.5, 33X12.50R20 — or just the digits like 2256517. Live stock from Orlando, FL and Dallas, TX.",
  alternates: { canonical: "/tires/by-size" },
};

const POPULAR: Record<string, string[]> = {
  "st-trailer": ["ST205/75R14", "ST205/75R15", "ST225/75R15", "ST235/80R16", "ST235/85R16"],
  passenger: ["195/65R15", "205/55R16", "215/55R17", "225/65R17", "235/65R18"],
  "light-truck": ["LT245/75R16", "LT265/70R17", "LT285/75R16", "33X12.50R20", "35X12.50R20"],
  "commercial-truck": ["11R22.5", "11R24.5", "295/75R22.5", "285/75R24.5", "225/70R19.5"],
};

export default function TiresBySizePage() {
  return (
    <div>
      <div className="relative left-1/2 w-screen -translate-x-1/2 bg-navy-900 text-white">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <nav aria-label="Breadcrumb" className="text-xs text-steel-400">
            <Link href="/" className="hover:text-white">Home</Link> / <Link href="/tires" className="hover:text-white">Tires</Link> / By Size
          </nav>
          <h1 className="h-display mt-2 text-4xl">Search by Tire Size</h1>
          <p className="mt-3 max-w-2xl text-sm text-steel-300">
            Type the size any way you know it — <span className="font-mono">225/65R17</span>,{" "}
            <span className="font-mono">ST235/80R16</span>, <span className="font-mono">11R22.5</span>, digits only like{" "}
            <span className="font-mono">2256517</span>, even a supplier spec with a ply suffix.
          </p>
          <form action="/tires" method="get" className="mt-5 flex max-w-lg gap-2">
            <label htmlFor="bs-q" className="sr-only">Tire size</label>
            <input id="bs-q" name="q" autoComplete="off" placeholder="Enter your tire size"
              className="w-full rounded-lg border-0 px-4 py-3 text-sm text-navy-900" />
            <button className="btn-gold shrink-0">Search</button>
          </form>
        </div>
      </div>

      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        {Object.entries(POPULAR).map(([slug, sizes]) => (
          <div key={slug} className="rounded-2xl border border-steel-200 bg-white p-6 shadow-card">
            <Link href={`/tires/${slug}`} className="font-display text-xl font-bold uppercase text-navy-900 hover:text-brand-dark">
              {CATEGORY_SLUGS[slug].label} →
            </Link>
            <div className="mt-3 flex flex-wrap gap-2">
              {sizes.map((s) => (
                <Link key={s} href={`/tires?q=${encodeURIComponent(s)}`}
                  className="rounded-md bg-steel-100 px-2.5 py-1.5 text-xs font-semibold text-navy-800 transition hover:bg-brand/20">
                  {s}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-8 text-sm text-steel-500">
        Not sure what size you need? <Link href="/tires/by-vehicle" className="font-bold text-brand-dark">Find the size your vehicle takes</Link>{" "}
        or compare two sizes with the <Link href="/tools/tire-size-calculator" className="font-bold text-brand-dark">tire size calculator</Link>.
      </p>
    </div>
  );
}
