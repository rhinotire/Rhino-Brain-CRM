import type { Metadata } from "next";
import Link from "next/link";
import { PublicCatalogService, sizeSuggestion } from "@rhino/services";
import { ProductCard } from "@/components/product-card";
import { CATEGORY_SLUGS } from "@/lib/site";

export const metadata: Metadata = {
  title: "Wholesale Tires — Trailer, Passenger, Light Truck & Commercial",
  description:
    "Browse wholesale tires by category: ST trailer, passenger, light truck and commercial truck. Live stock status from our Orlando and Dallas warehouses.",
  alternates: { canonical: "/tires" },
};

export const revalidate = 300; // ISR — product edits in RHINO BRAIN show within minutes

export default async function TiresHub({ searchParams }: { searchParams: { q?: string } }) {
  const q = searchParams.q?.trim();
  const results = q ? await PublicCatalogService.listPublished({ query: q, take: 60 }) : null;

  const POPULAR: Record<string, string[]> = {
    "st-trailer": ["ST205/75R15", "ST225/75R15", "ST235/80R16"],
    passenger: ["205/55R16", "225/65R17", "225/45R17"],
    "light-truck": ["LT265/70R17", "LT285/75R16"],
    "commercial-truck": ["11R22.5", "295/75R22.5"],
  };

  return (
    <div>
      {/* page header band */}
      <div className="relative left-1/2 w-screen -translate-x-1/2 bg-navy-900 text-white">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <nav aria-label="Breadcrumb" className="text-xs text-steel-400">
            <Link href="/" className="hover:text-white">Home</Link> / Tires
          </nav>
          <h1 className="h-display mt-2 text-4xl">{q ? `Search: “${q}”` : "Wholesale Tires"}</h1>
          <form action="/tires" className="mt-4 flex max-w-lg gap-2">
            <label htmlFor="tires-q" className="sr-only">Search size, SKU or brand</label>
            <input id="tires-q" name="q" defaultValue={q} placeholder='Size, SKU or brand — e.g. "ST235/80R16"'
              className="w-full rounded-lg border-0 px-4 py-3 text-sm text-navy-900" />
            <button className="btn-gold shrink-0">Search</button>
          </form>
        </div>
      </div>

      {results ? (
        results.length ? (
          <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
            {results.map((p) => (
              <ProductCard key={p.sku} p={p} />
            ))}
          </div>
        ) : (
          <div className="mt-8 rounded-2xl bg-steel-100 p-6 text-sm text-steel-500">
            {sizeSuggestion(q ?? "") && (
              <p className="mb-2 font-semibold text-navy-900">{sizeSuggestion(q ?? "")}</p>
            )}
            <p>
              No published products match “{q}”. Call us — our warehouse stocks more than the site shows, or{" "}
              <Link href="/quote" className="font-bold text-brand-dark">request a quote</Link>.
            </p>
          </div>
        )
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Object.entries(CATEGORY_SLUGS).map(([slug, c]) => (
            <Link key={slug} href={`/tires/${slug}`}
              className="group rounded-2xl border border-steel-200 bg-white p-6 shadow-card transition hover:-translate-y-0.5 hover:border-brand hover:shadow-lift">
              <div className="font-display text-2xl font-bold uppercase text-navy-900">{c.label}</div>
              <div className="mt-1 text-xs text-steel-500">Dealer pricing · pallet &amp; container programs</div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(POPULAR[slug] ?? []).map((s) => (
                  <span key={s} className="rounded-md bg-steel-100 px-2 py-1 text-xs font-semibold text-navy-800 group-hover:bg-brand/15">{s}</span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
