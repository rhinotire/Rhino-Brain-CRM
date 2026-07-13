import type { Metadata } from "next";
import Link from "next/link";
import { PublicCatalogService } from "@rhino/services";
import { ProductCard } from "@/components/product-card";
import { SITE } from "@/lib/site";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Deals & Special Offers — Wholesale Tires and Wheels",
  description:
    "Current wholesale specials on tires, wheels and trailer parts. Volume pricing on pallets and containers from Orlando, FL and Dallas, TX.",
  alternates: { canonical: "/deals" },
};

export default async function DealsPage() {
  const products = await PublicCatalogService.listPublished({ specialOffer: true, take: 200 });

  return (
    <div className="pt-8">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
        <Link href="/">Home</Link> / Deals
      </nav>
      <h1 className="mt-2 text-2xl font-black">Deals &amp; Special Offers</h1>
      <p className="mt-2 max-w-2xl text-sm text-steel-500">
        Overstock, close-outs and volume specials. Dealer pricing shown on approved accounts.
      </p>

      {products.length ? (
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {products.map((p) => (
            <ProductCard key={p.sku} p={p} />
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-xl bg-slate-50 p-6 text-sm text-slate-600">
          <p>
            No public specials posted right now — but volume deals move fast and many never hit the site. Call{" "}
            {SITE.phoneDisplay} or <Link href="/quote" className="font-bold text-brand-dark">request a quote</Link> and ask
            about current overstock.
          </p>
          <p className="mt-2">
            Dealers: ask your rep about this week&apos;s <span className="font-semibold">special flyer</span>.
          </p>
        </div>
      )}
    </div>
  );
}
