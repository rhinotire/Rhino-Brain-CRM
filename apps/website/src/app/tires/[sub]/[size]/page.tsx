import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicCatalogService } from "@rhino/services";
import { ProductCard } from "@/components/product-card";
import { JsonLd } from "@/components/json-ld";
import { CATEGORY_SLUGS, SITE, sizeKey } from "@/lib/site";

export const revalidate = 300;

type Params = { sub: string; size: string };

export function generateMetadata({ params }: { params: Params }): Metadata {
  const cat = CATEGORY_SLUGS[params.sub];
  const pretty = params.size.toUpperCase().replace(/-/g, " ");
  return {
    title: `${pretty} Tires Wholesale — All SKUs In Stock`,
    description: `Every ${pretty} SKU we stock, with live availability from Orlando and Dallas. ${cat?.label ?? "Tires"} at dealer pricing.`,
    alternates: { canonical: `/tires/${params.sub}/${params.size}` },
  };
}

/** Size page — key SEO surface: lists all SKUs in one size (docs/sitemap.md). */
export default async function SizePage({ params }: { params: Params }) {
  const cat = CATEGORY_SLUGS[params.sub];
  if (!cat) notFound();

  const all = await PublicCatalogService.listPublished({ category: cat.db, take: 200 });
  const wanted = sizeKey(params.size);
  const products = all.filter((p) => p.sizeSpec && sizeKey(p.sizeSpec) === wanted);
  if (!products.length) notFound();

  const displaySize = products[0].sizeSpec!;

  return (
    <div className="pt-8">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
        <Link href="/">Home</Link> / <Link href="/tires">Tires</Link> /{" "}
        <Link href={`/tires/${params.sub}`}>{cat.label}</Link> / {displaySize}
      </nav>
      <h1 className="mt-2 text-2xl font-black">{displaySize} — {products.length} SKU{products.length > 1 ? "s" : ""} in stock program</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        Wholesale {displaySize} {cat.label.toLowerCase()} from our Florida and Texas warehouses. Dealer pricing by tier —
        log in or <Link href="/quote" className="font-bold text-brand-dark">request a quote</Link>.
      </p>
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {products.map((p) => (
          <ProductCard key={p.sku} p={p} />
        ))}
      </div>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: `${displaySize} tires`,
          itemListElement: products.map((p, i) => ({
            "@type": "ListItem",
            position: i + 1,
            url: `${SITE.url}/products/${p.slug}`,
            name: p.name,
          })),
        }}
      />
    </div>
  );
}
