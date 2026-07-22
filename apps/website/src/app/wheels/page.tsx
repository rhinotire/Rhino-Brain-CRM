import type { Metadata } from "next";
import Link from "next/link";
import { PublicCatalogService } from "@rhino/services";
import { ProductCard } from "@/components/product-card";
import { SITE } from "@/lib/site";
import { COPY } from "@/lib/brand-copy";

export const metadata: Metadata = {
  title: "Wholesale Wheels — Trailer, Off-Road & Custom",
  description: `Wholesale wheels: trailer spoke/mod/galvanized plus off-road and custom truck wheels (20X10, 22X12). Common bolt patterns in stock in ${COPY.whShort}.`,
  alternates: { canonical: "/wheels" },
};

export const revalidate = 300;

const POPULAR_SIZES = ["15X5", "15X6", "20X10", "22X12", "spoke"];
const POPULAR_BOLTS = ["5x4.5", "6x5.5"];

export default async function WheelsPage({ searchParams }: { searchParams: { q?: string; bolt?: string } }) {
  const q = searchParams.q?.trim();
  const bolt = searchParams.bolt?.trim();
  const products = await PublicCatalogService.listPublished({
    category: "WHEELS",
    query: q || undefined,
    boltPattern: bolt || undefined,
    take: 200,
  });
  const heading = q && bolt ? `Wheels: “${q}” · ${bolt}` : q ? `Wheels: “${q}”` : bolt ? `Wheels: ${bolt} bolt pattern` : "Wheels";

  return (
    <div>
      {/* page header band with search — same pattern as /tires */}
      <div className="relative left-1/2 w-screen -translate-x-1/2 bg-navy-900 text-white">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <nav aria-label="Breadcrumb" className="text-xs text-steel-400">
            <Link href="/" className="hover:text-white">Home</Link> / Wheels
          </nav>
          <h1 className="h-display mt-2 text-4xl">{heading}</h1>
          <p className="mt-2 max-w-2xl text-sm text-steel-300">
            Trailer wheels — spoke, mod, galvanized — plus off-road and custom truck wheels.
          </p>
          <form action="/wheels" method="get" className="mt-4 flex max-w-2xl flex-wrap gap-2">
            <label htmlFor="wheels-q" className="sr-only">Wheel size or style</label>
            <input id="wheels-q" name="q" defaultValue={q} autoComplete="off"
              placeholder='Size or style — "2010", "15X6", "spoke"'
              className="min-w-[14rem] flex-1 rounded-lg border-0 px-4 py-3 text-sm text-navy-900" />
            <label htmlFor="wheels-bolt" className="sr-only">Bolt pattern</label>
            <input id="wheels-bolt" name="bolt" defaultValue={bolt} autoComplete="off"
              placeholder='Bolt pattern — "6x5.5"'
              className="w-44 rounded-lg border-0 px-4 py-3 text-sm text-navy-900" />
            <button className="btn-gold shrink-0">Search</button>
          </form>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-steel-400">Sizes:</span>
            {POPULAR_SIZES.map((s) => (
              <Link key={s} href={`/wheels?q=${encodeURIComponent(s)}${bolt ? `&bolt=${encodeURIComponent(bolt)}` : ""}`}
                className="rounded-md bg-white/10 px-2 py-1 text-xs font-semibold text-white transition hover:bg-brand hover:text-navy-900">
                {s}
              </Link>
            ))}
            <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-steel-400">Bolt patterns:</span>
            {POPULAR_BOLTS.map((b) => (
              <Link key={b} href={`/wheels?bolt=${encodeURIComponent(b)}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                className="rounded-md bg-white/10 px-2 py-1 text-xs font-semibold text-white transition hover:bg-brand hover:text-navy-900">
                {b}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {products.length ? (
        <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
          {products.map((p) => <ProductCard key={p.sku} p={p} />)}
        </div>
      ) : (
        <p className="mt-8 rounded-xl bg-slate-50 p-6 text-sm text-slate-600">
          {q || bolt ? <>No published wheels match {q ? <>“{q}”</> : null}{q && bolt ? " with " : ""}{bolt ? <>{bolt} bolt pattern</> : null}. </> : <>Wheel catalog is being published. </>}
          Call {SITE.phoneDisplay} or <Link href="/quote" className="font-bold text-brand-dark">request a quote</Link> — we
          stock more than the site shows.
        </p>
      )}

      <p className="mt-8 text-sm text-steel-500">
        Not sure about your pattern? Use the{" "}
        <Link href="/tools/bolt-pattern-guide" className="font-bold text-brand-dark">bolt pattern guide</Link> or the{" "}
        <Link href="/tools/offset-backspacing-calculator" className="font-bold text-brand-dark">offset ↔ backspacing calculator</Link>.
      </p>
    </div>
  );
}
