import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicCatalogService } from "@rhino/services";
import { ProductCard } from "@/components/product-card";
import { JsonLd } from "@/components/json-ld";
import { CATEGORY_SLUGS, MARKET_TOP_SIZES, POPULAR_BY_CATEGORY, SITE } from "@/lib/site";
import { SizeBrowser } from "@/components/size-browser";
import { COPY } from "@/lib/brand-copy";

export const revalidate = 300;

/** Known category slugs prebuild at deploy; without generateStaticParams the
 * route silently falls out of ISR and renders on every request (2.5s TTFB). */
export function generateStaticParams() {
  return Object.keys(CATEGORY_SLUGS).map((sub) => ({ sub }));
}

type Params = { sub: string };

/**
 * B2B landing content for the two commercial-heavy categories (master
 * instruction §6.4/§6.5) — intro line under the H1 plus a lead-capture band
 * after the grid. Other categories stay as plain catalog pages.
 */
const B2B_SECTIONS: Record<
  string,
  { intro: string; heading: string; bullets: string[]; ctas: { href: string; label: string; primary?: boolean }[] }
> = {
  "commercial-truck": {
    intro:
      "Steer, drive, trailer and all-position tires for fleets, owner-operators and commercial dealers — regional and long-haul patterns at dealer tier pricing.",
    heading: "Buying for a fleet?",
    bullets: [
      "Every wheel position from one supplier — steer, drive, trailer, all-position",
      "Size consolidation and replacement planning for multi-vehicle fleets",
      COPY.deliveryStat,
      "Emergency sourcing through our supplier network when a unit is down",
    ],
    ctas: [
      { href: "/quote", label: "Request Commercial Tire Quote", primary: true },
      { href: "/fleet-solutions", label: "Fleet Solutions" },
    ],
  },
  "st-trailer": {
    intro:
      "ST trailer tires and mounted tire & wheel assemblies for trailer manufacturers, trailer dealers and repair shops — heavy-duty load ranges, matched to the trailer's placard.",
    heading: "Trailer manufacturers & dealers",
    bullets: [
      "Mounted, ready-to-bolt-on tire & wheel assemblies — see Tire & Wheel Packages",
      "Heavy-duty load ranges for utility, boat, horse, enclosed and equipment trailers",
      "Bulk factory supply — recurring pallet and container programs for production lines",
      COPY.dealerWarehouseBenefit,
    ],
    ctas: [
      { href: "/quote", label: "Get Trailer Tire & Wheel Quote", primary: true },
      { href: "/packages", label: "Browse Assemblies" },
      { href: "/become-a-dealer", label: "Factory Supply Pricing" },
    ],
  },
};

export function generateMetadata({ params }: { params: Params }): Metadata {
  const cat = CATEGORY_SLUGS[params.sub];
  if (!cat) return {};
  return {
    title: `${cat.label} — Wholesale Pricing & Live Stock`,
    description: `Wholesale ${cat.label.toLowerCase()} in stock in ${COPY.wh}. Dealer tier pricing — request a quote or apply for a dealer account.`,
    alternates: {
      canonical: `/tires/${params.sub}`,
      languages: { en: `/tires/${params.sub}`, es: `/es/tires/${params.sub}` },
    },
  };
}

export default async function SubcategoryPage({ params }: { params: Params }) {
  const cat = CATEGORY_SLUGS[params.sub];
  if (!cat) notFound();

  const products = await PublicCatalogService.listPublished({ category: cat.db, take: 1000 });
  const sizes = [...new Set(products.map((p) => p.sizeSpec).filter((s): s is string => !!s))];

  // Top Sellers = US replacement-market best sellers we actually stock,
  // topped up with our deepest-stocked sizes when fewer than 10 match
  const counts = new Map<string, number>();
  for (const p of products) if (p.sizeSpec) counts.set(p.sizeSpec, (counts.get(p.sizeSpec) ?? 0) + 1);
  const market = (MARKET_TOP_SIZES[params.sub] ?? []).filter((s) => counts.has(s));
  const byStock = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s).filter((s) => !market.includes(s));
  const top10 = [...market, ...byStock].slice(0, 10);

  return (
    <div className="pt-8">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
        <Link href="/">Home</Link> / <Link href="/tires">Tires</Link> / {cat.label}
      </nav>
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-3">
        <h1 className="text-2xl font-black">{cat.label}</h1>
        <form action="/tires" method="get" className="flex gap-2">
          <label htmlFor="cat-q" className="sr-only">Search tire size</label>
          <input id="cat-q" name="q" placeholder='Search a size — "2055516"' autoComplete="off"
            className="w-56 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <button className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-ink">Search</button>
        </form>
      </div>
      {B2B_SECTIONS[params.sub] && (
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">{B2B_SECTIONS[params.sub].intro}</p>
      )}

      <SizeBrowser sizes={sizes} hrefBase={`/tires/${params.sub}`} popular={top10.length ? top10 : POPULAR_BY_CATEGORY[params.sub]} />

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

      {B2B_SECTIONS[params.sub] && (
        <section className="mt-10 rounded-2xl bg-navy-900 p-6 text-white">
          <h2 className="h-display text-2xl">{B2B_SECTIONS[params.sub].heading}</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-steel-300">
            {B2B_SECTIONS[params.sub].bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <div className="mt-5 flex flex-wrap gap-3">
            {B2B_SECTIONS[params.sub].ctas.map((c) => (
              <Link key={c.href} href={c.href} className={c.primary ? "btn-gold" : "btn-ghost-dark"}>
                {c.label}
              </Link>
            ))}
          </div>
        </section>
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
