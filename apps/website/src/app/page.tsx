import Link from "next/link";
import type { Metadata } from "next";
import { SITE, CATEGORY_SLUGS } from "@/lib/site";
import { ARTICLES } from "@/lib/articles";

export const metadata: Metadata = {
  title: "Rhino Tire USA — Wholesale Tires, Wheels & Trailer Parts Distributor",
  description:
    "B2B tire distributor with warehouses in Orlando, FL and Dallas, TX. ST trailer, passenger, light-truck and commercial-truck tires at dealer pricing. Same-week delivery in Florida.",
  alternates: { canonical: "/" },
};

export default function HomePage() {
  return (
    <div className="space-y-14 pt-8">
      {/* Hero */}
      <section className="text-center">
        <h1 className="mx-auto max-w-3xl text-3xl font-black leading-tight sm:text-5xl">
          Wholesale Tires, Wheels &amp; Trailer Parts — <span className="text-brand-dark">Dealer Pricing, Real Stock</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-slate-600">
          {SITE.description}
        </p>
        {/* Size / SKU search above the fold */}
        <form action="/tires" className="mx-auto mt-6 flex max-w-xl gap-2">
          <label htmlFor="home-q" className="sr-only">Search by size or SKU</label>
          <input
            id="home-q"
            name="q"
            placeholder='Search size or SKU — e.g. "ST235/80R16"'
            className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm"
          />
          <button className="shrink-0 rounded-lg bg-ink px-5 py-3 text-sm font-bold text-white">Search</button>
        </form>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/tires" className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-bold">Search Inventory</Link>
          <Link href="/quote" className="rounded-lg bg-brand px-5 py-3 text-sm font-bold text-ink">Get Wholesale Quote</Link>
          <Link href="/become-a-dealer" className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-bold">Become a Dealer</Link>
        </div>
      </section>

      {/* Category tiles */}
      <section>
        <h2 className="text-xl font-bold">Shop by Category</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {Object.entries(CATEGORY_SLUGS).map(([slug, c]) => (
            <Link key={slug} href={`/tires/${slug}`} className="rounded-xl border border-slate-200 p-5 font-bold hover:border-brand">
              {c.label}
              <div className="mt-1 text-xs font-normal text-slate-500">Wholesale pallet &amp; container pricing</div>
            </Link>
          ))}
        </div>
      </section>

      {/* Solutions strip */}
      <section className="rounded-2xl bg-slate-50 p-6">
        <h2 className="text-xl font-bold">Built for Volume Buyers</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {[
            ["Tire Dealers", "Tier pricing, weekly restock runs, mixed pallets."],
            ["Trailer Manufacturers", "Assemblies programs, bolt-pattern matching, JIT delivery."],
            ["Fleets", "Commercial-truck positions, casing programs, national brands."],
          ].map(([t, d]) => (
            <div key={t} className="rounded-xl bg-white p-4">
              <div className="font-bold">{t}</div>
              <p className="mt-1 text-sm text-slate-600">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Knowledge teaser */}
      <section>
        <h2 className="text-xl font-bold">From the Knowledge Center</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {ARTICLES.map((a) => (
            <Link key={a.slug} href={`/knowledge/${a.slug}`} className="rounded-xl border border-slate-200 p-5 hover:border-brand">
              <div className="font-bold">{a.title}</div>
              <p className="mt-1 text-sm text-slate-600">{a.answer.slice(0, 120)}…</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
