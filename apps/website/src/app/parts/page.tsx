import type { Metadata } from "next";
import Link from "next/link";
import { PublicCatalogService } from "@rhino/services";
import { ProductCard } from "@/components/product-card";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Wholesale Trailer Parts — Hubs, Axles & Accessories",
  description: "Trailer hubs, axles, bearing kits and accessories at wholesale pricing from Florida and Texas warehouses.",
  alternates: { canonical: "/parts" },
};

export const revalidate = 300;

const POPULAR = ["hub", "axle", "bearing", "fender", "coupler", "jack"];

export default async function PartsPage({ searchParams }: { searchParams: { q?: string } }) {
  const q = searchParams.q?.trim();
  const products = await PublicCatalogService.listPublished({ category: "TRAILER_PARTS", query: q || undefined, take: 200 });

  return (
    <div>
      {/* page header band with search — same pattern as /tires and /wheels */}
      <div className="relative left-1/2 w-screen -translate-x-1/2 bg-navy-900 text-white">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <nav aria-label="Breadcrumb" className="text-xs text-steel-400">
            <Link href="/" className="hover:text-white">Home</Link> / Trailer Parts
          </nav>
          <h1 className="h-display mt-2 text-4xl">{q ? `Parts: “${q}”` : "Trailer Parts"}</h1>
          <form action="/parts" method="get" className="mt-4 flex max-w-lg gap-2">
            <label htmlFor="parts-q" className="sr-only">Search trailer parts</label>
            <input id="parts-q" name="q" defaultValue={q} autoComplete="off"
              placeholder='Part or SKU — "hub", "bearing kit", "5-lug"'
              className="w-full rounded-lg border-0 px-4 py-3 text-sm text-navy-900" />
            <button className="btn-gold shrink-0">Search</button>
          </form>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-steel-400">Popular:</span>
            {POPULAR.map((s) => (
              <Link key={s} href={`/parts?q=${encodeURIComponent(s)}`}
                className="rounded-md bg-white/10 px-2 py-1 text-xs font-semibold text-white transition hover:bg-brand hover:text-navy-900">
                {s}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {products.length ? (
        <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
          {products.map((p) => <ProductCard key={p.sku} p={p} />)}
        </div>
      ) : (
        <p className="mt-8 rounded-xl bg-slate-50 p-6 text-sm text-slate-600">
          {q ? <>No published parts match “{q}”. </> : <>Parts catalog is being published. </>}
          Call {SITE.phoneDisplay} or <Link href="/quote" className="font-bold text-brand-dark">request a quote</Link> — we
          stock more than the site shows.
        </p>
      )}
    </div>
  );
}
