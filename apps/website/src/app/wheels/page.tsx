import type { Metadata } from "next";
import Link from "next/link";
import { PublicCatalogService } from "@rhino/services";
import { ProductCard } from "@/components/product-card";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Wholesale Trailer Wheels — Steel, Mod & Spoke",
  description: "Steel trailer wheels at wholesale: white spoke, silver mod, galvanized. Common bolt patterns in stock in Orlando and Dallas.",
  alternates: { canonical: "/wheels" },
};

export const revalidate = 300;

export default async function WheelsPage() {
  const products = await PublicCatalogService.listPublished({ category: "WHEELS", take: 200 });
  return (
    <div className="pt-8">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500"><Link href="/">Home</Link> / Wheels</nav>
      <h1 className="mt-2 text-2xl font-black">Trailer Wheels</h1>
      {products.length ? (
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {products.map((p) => <ProductCard key={p.sku} p={p} />)}
        </div>
      ) : (
        <p className="mt-6 rounded-xl bg-slate-50 p-6 text-sm text-slate-600">
          Wheel catalog is being published. Call {SITE.phoneDisplay} or <Link href="/quote" className="font-bold text-brand-dark">request a quote</Link>.
        </p>
      )}
    </div>
  );
}
