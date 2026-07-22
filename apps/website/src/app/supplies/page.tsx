import type { Metadata } from "next";
import Link from "next/link";
import { PublicCatalogService } from "@rhino/services";
import { ProductCard } from "@/components/product-card";
import { SITE } from "@/lib/site";
import { COPY } from "@/lib/brand-copy";

export const metadata: Metadata = {
  title: "Motor Oil & Tire Shop Supplies — Wholesale",
  description: `Motor oil and lubricants at wholesale, with tire shop supplies — balance weights, valve stems, patches and tools — joining the catalog. ${COPY.wh}.`,
  alternates: { canonical: "/supplies" },
};

export const revalidate = 300;

export default async function SuppliesPage({ searchParams }: { searchParams: { q?: string } }) {
  const q = searchParams.q?.trim();
  const products = await PublicCatalogService.listPublished({ category: "OIL_LUBRICANTS", query: q || undefined, take: 200 });

  return (
    <div>
      {/* page header band with search — same pattern as the other category pages */}
      <div className="relative left-1/2 w-screen -translate-x-1/2 bg-navy-900 text-white">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <nav aria-label="Breadcrumb" className="text-xs text-steel-400">
            <Link href="/" className="hover:text-white">Home</Link> / Oil &amp; Supplies
          </nav>
          <h1 className="h-display mt-2 text-4xl">{q ? `Supplies: “${q}”` : "Motor Oil & Shop Supplies"}</h1>
          <p className="mt-2 max-w-2xl text-sm text-steel-300">
            One truck, one invoice: motor oil and lubricants today — balance weights, valve stems, patches and shop
            tools rolling into the catalog next.
          </p>
          <form action="/supplies" method="get" className="mt-4 flex max-w-lg gap-2">
            <label htmlFor="sup-q" className="sr-only">Search oil and supplies</label>
            <input id="sup-q" name="q" defaultValue={q} autoComplete="off"
              placeholder='Product or SKU — "5W-30", "ATF", "grease"'
              className="w-full rounded-lg border-0 px-4 py-3 text-sm text-navy-900" />
            <button className="btn-gold shrink-0">Search</button>
          </form>
        </div>
      </div>

      {products.length ? (
        <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
          {products.map((p) => <ProductCard key={p.sku} p={p} />)}
        </div>
      ) : (
        <p className="mt-8 rounded-xl bg-slate-50 p-6 text-sm text-slate-600">
          {q ? <>No published supplies match “{q}”. </> : <>The oil &amp; supplies catalog is being published. </>}
          Call {SITE.phoneDisplay} or <Link href="/quote" className="font-bold text-brand-dark">request a quote</Link> — we
          stock more than the site shows.
        </p>
      )}

      <div className="mt-8 rounded-2xl bg-navy-900 p-7 text-white shadow-card">
        <h2 className="h-display text-2xl">Shop supplies program — coming to the catalog</h2>
        <p className="mt-2 max-w-2xl text-sm text-steel-300">
          Balance weights, valve stems, patch &amp; plug kits and shop consumables are joining the line. Tell us what your
          shop burns through every month — we&apos;ll quote it with your tire order.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/quote" className="btn-gold">Request Supplies Quote</Link>
          <a href={`tel:${SITE.phone}`} className="btn-ghost-dark">Call {SITE.phoneDisplay}</a>
        </div>
      </div>
    </div>
  );
}
