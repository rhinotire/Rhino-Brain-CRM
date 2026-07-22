import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicCatalogService } from "@rhino/services";
import { ProductCard } from "@/components/product-card";
import { JsonLd } from "@/components/json-ld";
import { CATEGORY_SLUGS, SITE, sizeToSlug } from "@/lib/site";
import { COPY } from "@/lib/brand-copy";

export const revalidate = 300;

type Params = { sub: string };

export function generateMetadata({ params }: { params: Params }): Metadata {
  const cat = CATEGORY_SLUGS[params.sub];
  if (!cat) return {};
  return {
    title: `${cat.label} — Wholesale Pricing & Live Stock`,
    description: `Wholesale ${cat.label.toLowerCase()} in stock in ${COPY.wh}. Dealer tier pricing — request a quote or apply for a dealer account.`,
    alternates: { canonical: `/tires/${params.sub}` },
  };
}

export default async function SubcategoryPage({ params }: { params: Params }) {
  const cat = CATEGORY_SLUGS[params.sub];
  if (!cat) notFound();

  const products = await PublicCatalogService.listPublished({ category: cat.db, take: 200 });
  const sizes = [...new Set(products.map((p) => p.sizeSpec).filter((s): s is string => !!s))];

  return (
    <div className="pt-8">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
        <Link href="/">Home</Link> / <Link href="/tires">Tires</Link> / {cat.label}
      </nav>
      <h1 className="mt-2 text-2xl font-black">{cat.label}</h1>

      {sizes.length > 1 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {sizes.map((s) => (
            <Link key={s} href={`/tires/${params.sub}/${sizeToSlug(s)}`} className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold hover:border-brand">
              {s}
            </Link>
          ))}
        </div>
      )}

      {products.length ? (
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {products.map((p) => (
            <ProductCard key={p.sku} p={p} />
          ))}
        </div>
      ) : (
        <p className="mt-6 rounded-xl bg-slate-50 p-6 text-sm text-slate-600">
          Catalog for this category is being published. Call {SITE.phoneDisplay} or{" "}
          <Link href="/quote" className="font-bold text-brand-dark">request a quote</Link> — we stock more than the site shows.
        </p>
      )}

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Home", item: SITE.url },
                { "@type": "ListItem", position: 2, name: "Tires", item: `${SITE.url}/tires` },
                { "@type": "ListItem", position: 3, name: cat.label, item: `${SITE.url}/tires/${params.sub}` },
              ],
            },
            {
              "@type": "ItemList",
              itemListElement: products.slice(0, 30).map((p, i) => ({
                "@type": "ListItem",
                position: i + 1,
                url: `${SITE.url}/products/${p.slug}`,
                name: p.name,
              })),
            },
          ],
        }}
      />
    </div>
  );
}
