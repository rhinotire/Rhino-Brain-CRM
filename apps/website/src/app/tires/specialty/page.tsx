import type { Metadata } from "next";
import Link from "next/link";
import { PublicCatalogService } from "@rhino/services";
import { ProductCard } from "@/components/product-card";
import { SITE, SPECIALTY_APPLICATIONS } from "@/lib/site";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Specialty Tires — ATV/UTV, Golf Cart, Lawn & Ag",
  description:
    "Wholesale specialty tires: ATV/UTV, golf cart, lawn & garden, industrial and agricultural. Dealer pricing from Orlando, FL and Dallas, TX warehouses.",
  alternates: { canonical: "/tires/specialty" },
};

export default async function SpecialtyTiresPage() {
  const products = await PublicCatalogService.listPublished({ applications: SPECIALTY_APPLICATIONS, take: 200 });

  return (
    <div className="pt-8">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
        <Link href="/">Home</Link> / <Link href="/tires">Tires</Link> / Specialty
      </nav>
      <h1 className="mt-2 text-2xl font-black">Specialty Tires</h1>
      <p className="mt-2 max-w-2xl text-sm text-steel-500">
        ATV &amp; UTV, golf cart, lawn &amp; garden, industrial and agricultural tires at wholesale pricing.
      </p>

      {products.length ? (
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {products.map((p) => (
            <ProductCard key={p.sku} p={p} />
          ))}
        </div>
      ) : (
        <p className="mt-6 rounded-xl bg-slate-50 p-6 text-sm text-slate-600">
          Our specialty catalog is being published. We stock ATV/UTV, golf cart, lawn &amp; garden and industrial tires —
          call {SITE.phoneDisplay} or <Link href="/quote" className="font-bold text-brand-dark">request a quote</Link> with
          the sizes you need.
        </p>
      )}
    </div>
  );
}
