import type { Metadata } from "next";
import Link from "next/link";
import { PublicCatalogService } from "@rhino/services";
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

  return (
    <div className="pt-8">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
        <Link href="/">Home</Link> / Tires
      </nav>
      <h1 className="mt-2 text-2xl font-black">{q ? `Search results for “${q}”` : "Wholesale Tires"}</h1>

      {results ? (
        results.length ? (
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            {results.map((p) => (
              <ProductCard key={p.sku} p={p} />
            ))}
          </div>
        ) : (
          <p className="mt-6 rounded-xl bg-slate-50 p-6 text-sm text-slate-600">
            No published products match “{q}”. Call us — our warehouse stocks more than the site shows, or{" "}
            <Link href="/quote" className="font-bold text-brand-dark">request a quote</Link>.
          </p>
        )
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Object.entries(CATEGORY_SLUGS).map(([slug, c]) => (
            <Link key={slug} href={`/tires/${slug}`} className="rounded-xl border border-slate-200 p-6 font-bold hover:border-brand">
              {c.label}
              <div className="mt-1 text-xs font-normal text-slate-500">Dealer pricing · pallet &amp; container programs</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
