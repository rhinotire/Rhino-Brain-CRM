import type { Metadata } from "next";
import { BRAND_KEY } from "@/lib/brand";
import Link from "next/link";
import { PublicCatalogService } from "@rhino/services";
import { ProductCard } from "@/components/product-card";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Tire & Wheel Packages — Mounted Trailer Assemblies",
  description:
    "Pre-mounted tire and wheel packages: trailer assemblies on spoke, mod and galvanized wheels, ready to bolt on. Wholesale pricing for dealers and trailer manufacturers.",
  alternates: { canonical: "/packages" },
};

export const revalidate = 300;

const POPULAR_ASSEMBLIES = [
  ["ST205/75R14 on 14X5.5 (5-lug)", "/packages?q=ST205/75R14"],
  ["ST205/75R15 on 15X6 (5-lug)", "/packages?q=ST205/75R15"],
  ["ST225/75R15 on 15X6 (6-lug)", "/packages?q=ST225/75R15"],
  ["ST235/80R16 on 16X6 (8-lug)", "/packages?q=ST235/80R16"],
] as const;

export default async function PackagesPage({ searchParams }: { searchParams: { q?: string } }) {
  const q = searchParams.q?.trim();
  // assemblies only — the search here never returns bare tires or bare wheels
  const products = await PublicCatalogService.listPublished({ brandKey: BRAND_KEY, assemblies: true, query: q || undefined, take: 200 });

  return (
    <div className="pt-8">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
        <Link href="/">Home</Link> / Tire &amp; Wheel Packages
      </nav>
      <h1 className="mt-2 text-2xl font-black">{q ? `Assemblies: “${q}”` : "Tire & Wheel Packages"}</h1>
      <p className="mt-2 max-w-2xl text-sm text-steel-500">
        Pre-mounted, balanced assemblies ready to bolt on — the biggest labor saver for trailer manufacturers and
        dealers. Spoke, mod and galvanized wheels in white, black and silver.
      </p>

      <form action="/packages" method="get" className="mt-4 flex max-w-lg gap-2">
        <label htmlFor="pkg-q" className="sr-only">Search assemblies by tire size</label>
        <input id="pkg-q" name="q" defaultValue={q} autoComplete="off"
          placeholder='Search assemblies by tire size — "ST205/75R15", "2057515"'
          className="w-full rounded-lg border border-steel-300 px-4 py-3 text-sm text-navy-900" />
        <button className="btn-gold shrink-0">Search</button>
      </form>

      {products.length ? (
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {products.map((p) => <ProductCard key={p.sku} p={p} />)}
        </div>
      ) : q ? (
        <p className="mt-6 rounded-xl bg-slate-50 p-6 text-sm text-slate-600">
          No published assemblies match “{q}”. Call {SITE.phoneDisplay} or{" "}
          <Link href="/quote" className="font-bold text-brand-dark">request a quote</Link> — we mount and stock far more
          than the site shows.
        </p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {POPULAR_ASSEMBLIES.map(([label, href]) => (
            <Link key={label} href={href}
              className="rounded-2xl border border-steel-200 bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:border-brand hover:shadow-lift">
              <div className="font-display text-lg font-bold uppercase text-navy-900">{label}</div>
              <div className="mt-1 text-xs text-steel-500">See live stock →</div>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-8 rounded-2xl bg-navy-900 p-7 text-white shadow-card">
        <h2 className="h-display text-2xl">Assembly programs for volume buyers</h2>
        <p className="mt-2 max-w-2xl text-sm text-steel-300">
          Tell us the tire size, wheel style, bolt pattern and monthly volume — we&apos;ll quote mounted assemblies by the
          pallet or container, with mixed loads available.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/quote" className="btn-gold">Request Assembly Quote</Link>
          <a href={`tel:${SITE.phone}`} className="btn-ghost-dark">Call {SITE.phoneDisplay}</a>
        </div>
      </div>
    </div>
  );
}
