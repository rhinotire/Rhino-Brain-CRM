import Link from "next/link";
import type { Metadata } from "next";
import { SITE, CATEGORY_SLUGS } from "@/lib/site";
import { ARTICLES } from "@/lib/articles";
import { getBrand } from "@/lib/brand";
import { TireGraphic, TreadTexture, TireIcon, WheelIcon, TruckIcon, TrailerIcon } from "@/components/graphics";

export const metadata: Metadata = {
  title: "Rhino Tire USA — Wholesale Tires, Wheels & Trailer Parts Distributor",
  description:
    "B2B tire distributor with warehouses in Orlando, FL and Dallas, TX. ST trailer, passenger, light-truck and commercial-truck tires at dealer pricing. Same-week delivery in Florida.",
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  const brand = await getBrand();
  return (
    <div className="space-y-14">
      {/* Hero — full-bleed dark banner: uploaded photo when set, tire graphics otherwise */}
      <section className="relative left-1/2 w-screen -translate-x-1/2 overflow-hidden bg-ink text-white">
        {brand.heroImageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={brand.heroImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-ink/70" />
          </>
        ) : (
          <>
            <TreadTexture className="absolute inset-0 h-full w-full text-white/[0.06]" />
            <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand/20 blur-3xl" />
          </>
        )}
        <div className="relative mx-auto grid max-w-6xl items-center gap-8 px-4 py-12 sm:py-16 md:grid-cols-[1fr_minmax(260px,340px)]">
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-brand">Wholesale tire &amp; wheel distributor · Orlando, FL</div>
            <h1 className="mt-3 max-w-2xl text-3xl font-black leading-tight sm:text-5xl">
              Tires, Wheels &amp; Trailer Parts <span className="text-brand">at Dealer Pricing</span>
            </h1>
            <p className="mt-4 max-w-xl text-slate-300">
              {SITE.description}
            </p>
            <form action="/tires" className="mt-6 flex max-w-xl gap-2">
              <label htmlFor="home-q" className="sr-only">Search by size or SKU</label>
              <input
                id="home-q"
                name="q"
                placeholder='Search size or SKU — e.g. "ST235/80R16"'
                className="w-full rounded-lg border-0 bg-white px-4 py-3 text-sm text-ink"
              />
              <button className="shrink-0 rounded-lg bg-brand px-5 py-3 text-sm font-bold text-ink">Search</button>
            </form>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/quote" className="rounded-lg bg-brand px-5 py-3 text-sm font-bold text-ink">Get Wholesale Quote</Link>
              <Link href="/become-a-dealer" className="rounded-lg border border-white/30 px-5 py-3 text-sm font-bold text-white hover:border-brand">Become a Dealer</Link>
              <Link href="/find-installation" className="rounded-lg border border-white/30 px-5 py-3 text-sm font-bold text-white hover:border-brand">Find Installation Near Me</Link>
            </div>
          </div>
          {!brand.heroImageUrl && (
            <TireGraphic className="mx-auto hidden w-full max-w-[340px] drop-shadow-2xl md:block" />
          )}
        </div>
        {/* value-prop strip */}
        <div className="relative border-t border-white/10 bg-black/30">
          <div className="mx-auto grid max-w-6xl gap-2 px-4 py-3 text-xs font-semibold text-slate-200 sm:grid-cols-3 sm:text-sm">
            <div className="flex items-center gap-2"><TruckIcon className="h-5 w-5 text-brand" /> Same-week delivery runs across Florida</div>
            <div className="flex items-center gap-2"><TireIcon className="h-5 w-5 text-brand" /> 1,000+ tire &amp; wheel SKUs in stock</div>
            <div className="flex items-center gap-2"><WheelIcon className="h-5 w-5 text-brand" /> Pallet &amp; container programs, mixed loads</div>
          </div>
        </div>
      </section>

      {/* Dual-channel: consumer installation path (spec §7) */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 p-6">
          <h2 className="text-xl font-bold">Buying for Your Business?</h2>
          <p className="mt-1 text-sm text-slate-600">Wholesale inventory, dealer tier pricing, pallet &amp; container programs.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/tires" className="rounded-lg bg-ink px-4 py-2.5 text-sm font-bold text-white">Search Wholesale Inventory</Link>
            <Link href="/become-a-dealer" className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-bold">Open Dealer Account</Link>
          </div>
        </div>
        <div className="rounded-2xl border-2 border-brand p-6">
          <h2 className="text-xl font-bold">Need Tires Installed?</h2>
          <p className="mt-1 text-sm text-slate-600">Enter your tire size and ZIP code to find local installation options.</p>
          <form action="/find-installation" className="mt-4 flex flex-wrap gap-2">
            <label htmlFor="home-size" className="sr-only">Tire size</label>
            <input id="home-size" name="size" placeholder="Tire size" className="min-w-[8rem] flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />
            <label htmlFor="home-zip" className="sr-only">ZIP code</label>
            <input id="home-zip" name="zip" required pattern="\d{5}" inputMode="numeric" placeholder="ZIP" className="w-24 rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />
            <button className="rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-ink">Find Local Options</button>
          </form>
        </div>
      </section>

      {/* Category tiles */}
      <section>
        <h2 className="text-xl font-bold">Shop by Category</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {Object.entries(CATEGORY_SLUGS).map(([slug, c]) => {
            const Icon = slug === "st-trailer" ? TrailerIcon : slug === "passenger" ? TireIcon : TruckIcon;
            return (
              <Link key={slug} href={`/tires/${slug}`} className="group rounded-xl border border-slate-200 p-5 font-bold transition hover:border-brand hover:shadow-sm">
                <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-brand/15 text-brand-dark transition group-hover:bg-brand group-hover:text-ink">
                  <Icon className="h-6 w-6" />
                </span>
                {c.label}
                <div className="mt-1 text-xs font-normal text-slate-500">Wholesale pallet &amp; container pricing</div>
              </Link>
            );
          })}
          <Link href="/wheels" className="group rounded-xl border border-slate-200 p-5 font-bold transition hover:border-brand hover:shadow-sm">
            <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-brand/15 text-brand-dark transition group-hover:bg-brand group-hover:text-ink">
              <WheelIcon className="h-6 w-6" />
            </span>
            Trailer Wheels
            <div className="mt-1 text-xs font-normal text-slate-500">Steel spoke, mod &amp; galvanized</div>
          </Link>
          <Link href="/parts" className="group rounded-xl border border-slate-200 p-5 font-bold transition hover:border-brand hover:shadow-sm">
            <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-brand/15 text-brand-dark transition group-hover:bg-brand group-hover:text-ink">
              <TrailerIcon className="h-6 w-6" />
            </span>
            Trailer Parts
            <div className="mt-1 text-xs font-normal text-slate-500">Hubs, axles &amp; accessories</div>
          </Link>
        </div>
      </section>

      {/* Solutions strip */}
      <section className="rounded-2xl bg-slate-50 p-6">
        <h2 className="text-xl font-bold">Built for Volume Buyers</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {[
            ["Tire Dealers", "Tier pricing, weekly restock runs, mixed pallets."],
            ["Trailer Manufacturers", "Assemblies programs, bolt-pattern matching, JIT delivery."],
            ["Fleets", "Commercial-truck positions, casing programs, national brands."],
          ].map(([t, d]) => (
            <div key={t} className="rounded-xl bg-white p-4">
              <div className="font-bold">{t}</div>
              <p className="mt-1 text-sm text-slate-600">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Knowledge teaser */}
      <section>
        <h2 className="text-xl font-bold">From the Knowledge Center</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {ARTICLES.map((a) => (
            <Link key={a.slug} href={`/knowledge/${a.slug}`} className="rounded-xl border border-slate-200 p-5 hover:border-brand">
              <div className="font-bold">{a.title}</div>
              <p className="mt-1 text-sm text-slate-600">{a.answer.slice(0, 120)}…</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
