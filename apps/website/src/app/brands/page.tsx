import type { Metadata } from "next";
import { BRAND_KEY } from "@/lib/brand";
import Link from "next/link";
import { PublicCatalogService } from "@rhino/services";
import { SITE } from "@/lib/site";
import { COPY } from "@/lib/brand-copy";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Tire & Wheel Brands We Stock",
  description: COPY.brandsDescription,
  alternates: { canonical: "/brands" },
};

export default async function BrandsPage() {
  const brands = await PublicCatalogService.listPublishedBrands(BRAND_KEY);

  return (
    <div className="pt-8">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
        <Link href="/">Home</Link> / Brands
      </nav>
      <h1 className="mt-2 text-2xl font-black">Shop All Brands</h1>
      <p className="mt-2 max-w-2xl text-sm text-steel-500">
        Value lines and national-brand alternatives, container-direct. Brands appear here as their catalog is published.
      </p>

      {brands.length ? (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {brands.map((b) => (
            <Link key={b.brand} href={`/tires?q=${encodeURIComponent(b.brand)}`}
              className="group rounded-2xl border border-steel-200 bg-white p-6 text-center shadow-card transition hover:-translate-y-0.5 hover:border-brand hover:shadow-lift">
              {b.logoUrl ? (
                <div className="flex h-14 items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={b.logoUrl} alt={b.brand} className="max-h-14 w-auto max-w-full object-contain" loading="lazy" />
                </div>
              ) : (
                <div className="flex h-14 items-center justify-center font-display text-xl font-bold uppercase text-navy-900 group-hover:text-brand-dark">
                  {b.brand}
                </div>
              )}
              <div className="mt-2 text-xs text-steel-500">{b.count} product{b.count === 1 ? "" : "s"} online</div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="mt-6 rounded-xl bg-slate-50 p-6 text-sm text-slate-600">
          The online brand catalog is being published now. We stock 20+ tire and wheel brands — call {SITE.phoneDisplay} or{" "}
          <Link href="/quote" className="font-bold text-brand-dark">request a quote</Link> for current availability and pricing.
        </p>
      )}
    </div>
  );
}
