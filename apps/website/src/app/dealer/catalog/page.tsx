import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DealerCatalogService, sizeSuggestion } from "@rhino/services";
import { ProductCard } from "@/components/product-card";
import { DealerBanner } from "@/components/dealer-banner";
import { DealerCartProvider, DealerCartBar } from "@/components/dealer-cart";
import { CATEGORY_SLUGS } from "@/lib/site";
import { getDealerSession } from "@/lib/dealer-session";

export const metadata: Metadata = {
  title: "Dealer Catalog — Your Pricing & Live Stock",
  robots: { index: false },
};

// Session-scoped page: always dynamic, never cached (prices differ per dealer).
export const dynamic = "force-dynamic";

type Search = { q?: string; cat?: string };

export default async function DealerCatalogPage({ searchParams }: { searchParams: Search }) {
  const session = await getDealerSession();
  if (!session) redirect("/dealer/login");

  const q = searchParams.q?.trim();
  const cat = searchParams.cat && CATEGORY_SLUGS[searchParams.cat] ? searchParams.cat : undefined;
  const products = await DealerCatalogService.listPublished(
    { query: q || undefined, category: cat ? CATEGORY_SLUGS[cat].db : undefined, take: 96 },
    session.tier,
  );

  return (
    <DealerCartProvider>
    <div className="pb-20 pt-6">
      <DealerBanner session={session} active="/dealer/catalog" />

      <h1 className="mt-5 text-2xl font-black">Dealer Catalog</h1>
      <form action="/dealer/catalog" className="mt-3 flex max-w-lg gap-2">
        {cat && <input type="hidden" name="cat" value={cat} />}
        <label htmlFor="dc-q" className="sr-only">Search size, SKU or brand</label>
        <input id="dc-q" name="q" defaultValue={q} placeholder='Size, SKU or brand — e.g. "ST235/80R16" or "2358016"'
          className="w-full rounded-lg border border-steel-300 px-4 py-2.5 text-sm" />
        <button className="btn-gold shrink-0">Search</button>
      </form>

      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={`/dealer/catalog${q ? `?q=${encodeURIComponent(q)}` : ""}`}
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${!cat ? "border-brand bg-brand/10 text-brand-dark" : "border-steel-300"}`}>
          All
        </Link>
        {Object.entries(CATEGORY_SLUGS).map(([slug, c]) => (
          <Link key={slug} href={`/dealer/catalog?cat=${slug}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${cat === slug ? "border-brand bg-brand/10 text-brand-dark" : "border-steel-300"}`}>
            {c.label}
          </Link>
        ))}
      </div>

      {products.length ? (
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {products.map((p) => (
            <ProductCard key={p.sku} p={p} dealer={{ price: p.dealerPrice, qty: p.qty, qtyByLocation: p.qtyByLocation }} />
          ))}
        </div>
      ) : (
        <div className="mt-6 rounded-2xl bg-steel-100 p-6 text-sm text-steel-500">
          {q && sizeSuggestion(q) && <p className="mb-2 font-semibold text-navy-900">{sizeSuggestion(q)}</p>}
          <p>
            Nothing published matches{q ? ` “${q}”` : " this filter"}. We stock more than the site shows —{" "}
            <Link href="/dealer/quick-order" className="font-bold text-brand-dark">send your list</Link> or call your rep.
          </p>
        </div>
      )}

      <p className="mt-8 text-xs text-steel-400">
        Add items and submit — your rep confirms pricing and availability on the final invoice.
        Quantities update with each warehouse sync. Big list? <Link href="/dealer/quick-order" className="font-bold text-brand-dark">Paste it in Quick Order</Link>.
      </p>
    </div>
    <DealerCartBar />
    </DealerCartProvider>
  );
}
