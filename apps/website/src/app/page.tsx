import Link from "next/link";
import type { Metadata } from "next";
import { SITE, CATEGORY_SLUGS } from "@/lib/site";
import { PublicArticleService, PublicCatalogService } from "@rhino/services";
import { ProductCard } from "@/components/product-card";
import { getBrand, BRAND_KEY } from "@/lib/brand";
import { HeroTireWheel, TreadTexture, TireIcon, WheelIcon, TruckIcon, TrailerIcon } from "@/components/graphics";
import { TireSearch } from "@/components/tire-search";

export const metadata: Metadata = {
  title: "Rhino Tire USA — Wholesale Tires, Wheels & Trailer Parts Distributor",
  description:
    "B2B tire distributor with warehouses in Orlando, FL and Dallas, TX. ST trailer, passenger, light-truck and commercial-truck tires at dealer pricing. Same-week delivery in Florida.",
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  const [brand, articles, hot, deals, arrivals] = await Promise.all([
    getBrand(),
    PublicArticleService.listPublished(BRAND_KEY),
    PublicCatalogService.listPublished({ bestSeller: true, take: 8 }),
    PublicCatalogService.listPublished({ specialOffer: true, take: 8 }),
    PublicCatalogService.listPublished({ sort: "newest", take: 8 }),
  ]);
  return (
    <div className="space-y-16">
      {/* ============ HERO — navy, metallic, gold ============ */}
      <section className="relative left-1/2 w-screen -translate-x-1/2 overflow-hidden bg-navy-950 text-white">
        {brand.heroImageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={brand.heroImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-navy-950/75" />
          </>
        ) : (
          <>
            <div className="absolute inset-0 bg-gradient-to-br from-navy-900 via-navy-950 to-navy-900" />
            <TreadTexture className="absolute inset-0 h-full w-full text-white/[0.05]" />
            <div className="absolute -right-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-brand/15 blur-3xl" />
            <div className="absolute -bottom-40 left-1/4 h-80 w-80 rounded-full bg-steel-400/10 blur-3xl" />
          </>
        )}
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-14 pt-12 sm:pt-16 md:grid-cols-[1fr_minmax(260px,400px)]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-brand-light">
              Wholesale tire &amp; wheel distributor · Orlando FL · Dallas TX
            </p>
            <h1 className="h-display mt-4 max-w-2xl text-5xl sm:text-7xl">
              Tires. Wheels.<br />
              <span className="text-brand">Dealer Pricing.</span>
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-steel-300">
              {SITE.description}
            </p>
            <div className="mt-7">
              <TireSearch />
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/quote" className="btn-gold">Get Wholesale Quote</Link>
              <Link href="/become-a-dealer" className="btn-ghost-dark">Become a Dealer</Link>
              <Link href="/find-installation" className="btn-ghost-dark">Find Installation</Link>
            </div>
          </div>
          {!brand.heroImageUrl && (
            <HeroTireWheel className="mx-auto hidden w-full max-w-[400px] drop-shadow-2xl md:block" />
          )}
        </div>
        {/* metallic stat band */}
        <div className="relative border-t border-white/10 bg-gradient-to-r from-navy-900 via-navy-800 to-navy-900">
          <div className="mx-auto grid max-w-6xl gap-x-6 gap-y-2 px-4 py-4 sm:grid-cols-3">
            {[
              [TruckIcon, "Same-week delivery runs across Florida"],
              [TireIcon, "1,000+ tire & wheel SKUs in stock"],
              [WheelIcon, "Pallet & container programs, mixed loads"],
            ].map(([Icon, text]) => {
              const I = Icon as typeof TruckIcon;
              return (
                <div key={text as string} className="flex items-center gap-2.5 text-sm font-semibold text-steel-200">
                  <I className="h-5 w-5 shrink-0 text-brand" /> {text as string}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============ DUAL JOURNEYS ============ */}
      <section className="grid gap-5 md:grid-cols-2">
        <div className="rounded-2xl bg-navy-900 p-7 text-white shadow-card">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-light">For tire shops · trailer builders · fleets</p>
          <h2 className="h-display mt-2 text-3xl">Buying for Your Business?</h2>
          <p className="mt-3 text-sm leading-relaxed text-steel-300">
            Tier pricing A–D, weekly Florida restock runs, mixed pallets and full containers from two warehouses.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/tires" className="btn-gold">Search Wholesale Inventory</Link>
            <Link href="/become-a-dealer" className="btn-ghost-dark">Open Dealer Account</Link>
          </div>
        </div>
        <div className="rounded-2xl border-2 border-brand bg-white p-7 shadow-card">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-dark">For drivers &amp; trailer owners</p>
          <h2 className="h-display mt-2 text-3xl text-navy-900">Need Tires Installed?</h2>
          <p className="mt-3 text-sm leading-relaxed text-steel-500">
            Enter your tire size and ZIP code — we&apos;ll show professional installation options near you.
          </p>
          <form action="/find-installation" className="mt-5 flex flex-wrap gap-2">
            <label htmlFor="home-size" className="sr-only">Tire size</label>
            <input id="home-size" name="size" placeholder="Tire size" className="min-w-[8rem] flex-1 rounded-lg border border-steel-300 px-3 py-3 text-sm" />
            <label htmlFor="home-zip" className="sr-only">ZIP code</label>
            <input id="home-zip" name="zip" required pattern="\d{5}" inputMode="numeric" placeholder="ZIP" className="w-24 rounded-lg border border-steel-300 px-3 py-3 text-sm" />
            <button className="btn-gold">Find Local Options</button>
          </form>
        </div>
      </section>

      {/* ============ MERCHANDISING — hot / deals / new, hide when empty ============ */}
      {hot.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="h-display text-3xl text-navy-900">🔥 Hot Right Now</h2>
            <Link href="/tires" className="text-sm font-bold text-brand-dark hover:underline">All tires →</Link>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">
            {hot.slice(0, 8).map((p) => <ProductCard key={p.sku} p={p} />)}
          </div>
        </section>
      )}
      {deals.length > 0 && (
        <section className="relative left-1/2 w-screen -translate-x-1/2 bg-gradient-to-r from-red-50 via-orange-50 to-red-50">
          <div className="mx-auto max-w-6xl px-4 py-10">
            <div className="flex items-baseline justify-between">
              <h2 className="h-display text-3xl text-red-600">🏷️ Deals &amp; Specials</h2>
              <Link href="/deals" className="text-sm font-bold text-red-600 hover:underline">All deals →</Link>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">
              {deals.slice(0, 8).map((p) => <ProductCard key={p.sku} p={p} dealBadge />)}
            </div>
          </div>
        </section>
      )}
      {arrivals.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="h-display text-3xl text-navy-900">New Arrivals</h2>
            <Link href="/tires" className="text-sm font-bold text-brand-dark hover:underline">Browse all →</Link>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">
            {arrivals.slice(0, 8).map((p) => <ProductCard key={p.sku} p={p} />)}
          </div>
        </section>
      )}

      {/* ============ CATEGORIES ============ */}
      <section>
        <h2 className="h-display text-3xl text-navy-900">Shop by Category</h2>
        <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {[
            ...Object.entries(CATEGORY_SLUGS).map(([slug, c]) => ({
              href: `/tires/${slug}`,
              label: c.label,
              blurb: "Pallet & container pricing",
              Icon: slug === "st-trailer" ? TrailerIcon : slug === "passenger" ? TireIcon : TruckIcon,
            })),
            { href: "/wheels", label: "Trailer Wheels", blurb: "Spoke, mod & galvanized", Icon: WheelIcon },
            { href: "/parts", label: "Trailer Parts", blurb: "Hubs, axles & more", Icon: TrailerIcon },
          ].map(({ href, label, blurb, Icon }) => (
            <Link key={href} href={href}
              className="group rounded-2xl border border-steel-200 bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:border-brand hover:shadow-lift">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-navy-900 text-brand transition group-hover:bg-brand group-hover:text-navy-900">
                <Icon className="h-6 w-6" />
              </span>
              <div className="mt-3 font-display text-lg font-bold uppercase leading-tight text-navy-900">{label}</div>
              <div className="mt-1 text-xs text-steel-500">{blurb}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* ============ WHO WE SERVE ============ */}
      <section className="relative left-1/2 w-screen -translate-x-1/2 bg-steel-100">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <h2 className="h-display text-3xl text-navy-900">Built for Volume Buyers</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {[
              ["Tire Dealers", "Tier pricing, weekly restock runs, mixed pallets — keep your racks full without tying up cash."],
              ["Trailer Manufacturers", "Assembly programs, bolt-pattern matching and JIT delivery straight to your line."],
              ["Fleets", "Commercial-truck positions, casing programs and national-brand alternatives that cut cost-per-mile."],
            ].map(([t, d]) => (
              <div key={t} className="rounded-2xl border-t-4 border-brand bg-white p-6 shadow-card">
                <div className="font-display text-xl font-bold uppercase text-navy-900">{t}</div>
                <p className="mt-2 text-sm leading-relaxed text-steel-500">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ CALCULATOR ============ */}
      <section className="overflow-hidden rounded-2xl bg-navy-900 shadow-card">
        <div className="relative p-7 text-white sm:flex sm:items-center sm:justify-between">
          <TreadTexture className="absolute inset-0 h-full w-full text-white/[0.04]" />
          <div className="relative">
            <h2 className="h-display text-3xl">Free Tire Size Calculator</h2>
            <p className="mt-2 max-w-xl text-sm text-steel-300">
              Compare any two sizes — diameter, revs per mile, speedometer error. Metric, ST trailer and 33X12.50R20 off-road formats.
            </p>
          </div>
          <Link href="/tools/tire-size-calculator" className="btn-gold relative mt-5 shrink-0 sm:mt-0">
            Open Calculator →
          </Link>
        </div>
      </section>

      {/* ============ KNOWLEDGE ============ */}
      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="h-display text-3xl text-navy-900">From the Knowledge Center</h2>
          <Link href="/knowledge" className="text-sm font-bold text-brand-dark hover:underline">All articles →</Link>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {articles.slice(0, 4).map((a) => (
            <Link key={a.slug} href={`/knowledge/${a.slug}`}
              className="rounded-2xl border border-steel-200 bg-white p-6 shadow-card transition hover:-translate-y-0.5 hover:border-brand hover:shadow-lift">
              <div className="font-display text-xl font-bold leading-snug text-navy-900">{a.title}</div>
              <p className="mt-2 text-sm text-steel-500">{a.answer.slice(0, 120)}…</p>
              <span className="mt-3 inline-block text-sm font-bold text-brand-dark">Read guide →</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
