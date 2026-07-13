import Link from "next/link";
import type { Brand } from "@/lib/brand";
import { MobileMenu } from "@/components/mobile-menu";
import { MAIN_NAV, TIRES_MEGA } from "@/lib/site";

const navLink =
  "border-b-2 border-transparent py-1 text-sm font-semibold text-navy-800 transition hover:border-brand hover:text-navy-900";

/** CSS-only mega menu — opens on hover and keyboard focus, no JS required. */
function TiresMega() {
  return (
    <div className="group relative">
      <Link href="/tires" className={`${navLink} inline-flex items-center gap-1`} aria-haspopup="true">
        Tires
        <svg viewBox="0 0 10 6" className="h-1.5 w-2.5 fill-current opacity-60" aria-hidden="true"><path d="M0 0h10L5 6z" /></svg>
      </Link>
      <div className="invisible absolute left-0 top-full z-50 pt-3 opacity-0 transition duration-150 group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
        <div className="grid w-[620px] grid-cols-3 gap-6 rounded-2xl border border-steel-200 bg-white p-6 shadow-lift">
          {TIRES_MEGA.map((col) => (
            <div key={col.title}>
              <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-steel-500">{col.title}</div>
              <ul className="mt-2.5 space-y-0.5">
                {col.items.map((it) => (
                  <li key={it.href}>
                    <Link href={it.href} className="block rounded-lg px-2 py-1.5 hover:bg-steel-100">
                      <span className="block text-sm font-semibold text-navy-900">{it.label}</span>
                      {it.blurb && <span className="block text-xs text-steel-500">{it.blurb}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Header({ brand }: { brand: Brand }) {
  return (
    <header className="sticky top-0 z-40 bg-white shadow-card">
      {/* navy microbar — dual-channel entry points always visible (spec §5) */}
      <div className="bg-navy-900 text-[13px] text-steel-200">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-1.5">
          <p className="hidden sm:block">
            <span className="font-semibold text-white">Dealers:</span>{" "}
            <Link href="/tires" className="underline decoration-brand/60 underline-offset-2 hover:text-brand-light">wholesale inventory</Link>
            {" · "}
            <Link href="/become-a-dealer" className="underline decoration-brand/60 underline-offset-2 hover:text-brand-light">dealer program</Link>
            <span className="mx-3 text-steel-500">|</span>
            <span className="font-semibold text-white">Consumers:</span>{" "}
            <Link href="/find-installation" className="underline decoration-brand/60 underline-offset-2 hover:text-brand-light">find installation near me</Link>
          </p>
          <p className="sm:hidden font-semibold text-white">Wholesale · Orlando, FL</p>
          <a href={`tel:${brand.phone}`} className="shrink-0 font-bold text-brand-light">{brand.phoneDisplay}</a>
        </div>
      </div>

      {/* main bar */}
      <div className="relative mx-auto flex max-w-6xl items-center gap-5 px-4 py-3">
        <Link href="/" className="shrink-0" aria-label={`${brand.name} home`}>
          {brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logoUrl} alt={brand.name} width={200} height={44} className="h-10 w-auto max-w-[210px] object-contain sm:h-11" />
          ) : brand.key === "EVERFLOW" ? (
            <span className="h-display text-2xl text-navy-900">EVERFLOW <span className="text-brand-dark">TIRES</span></span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/rhino-logo.svg" alt="Rhino Tires USA" className="h-10 w-auto max-w-[200px] object-contain sm:h-11" />
          )}
        </Link>
        <nav className="hidden items-center gap-5 md:flex" aria-label="Main">
          {MAIN_NAV.map((n) =>
            n.mega ? (
              <TiresMega key={n.href} />
            ) : (
              <Link key={n.href} href={n.href} className={navLink}>
                {n.label}
              </Link>
            )
          )}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <Link href="/quote" className="btn-gold hidden !py-2.5 md:inline-block">Get Quote</Link>
          <MobileMenu nav={MAIN_NAV} tiresMega={TIRES_MEGA} phone={brand.phone} phoneDisplay={brand.phoneDisplay} />
        </div>
      </div>
    </header>
  );
}

/** Mobile sticky bottom bar: Call · Find Installer · Get Quote (spec §6). */
export function MobileBar({ brand }: { brand: Brand }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t border-navy-800 bg-navy-900 text-center text-sm font-bold text-white md:hidden">
      <a href={`tel:${brand.phone}`} className="py-3.5">📞 Call</a>
      <Link href="/find-installation" className="border-x border-navy-800 py-3.5">🔧 Find Installer</Link>
      <Link href="/quote" className="bg-brand py-3.5 text-navy-900">Get Quote</Link>
    </div>
  );
}

export function Footer({ brand }: { brand: Brand }) {
  return (
    <footer className="mt-20 bg-navy-900 pb-28 text-steel-300 md:pb-10">
      <div className="h-1 bg-gradient-to-r from-brand via-brand-light to-brand" />
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 md:grid-cols-4">
        <div>
          <div className="h-display text-xl text-white">{brand.name.toUpperCase()}</div>
          {/* Standardized NAP — must match GBP and socials exactly */}
          <p className="mt-3 text-sm leading-relaxed">
            {brand.legalName}
            <br />
            {brand.address.streetAddress}
            <br />
            <a href={`tel:${brand.phone}`} className="font-bold text-white hover:text-brand-light">{brand.phoneDisplay}</a>
            {brand.contactEmail && (
              <>
                <br />
                <a href={`mailto:${brand.contactEmail}`} className="font-semibold text-brand-light hover:underline">{brand.contactEmail}</a>
              </>
            )}
          </p>
        </div>
        <div>
          <div className="text-sm font-bold uppercase tracking-wider text-brand">Products</div>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link className="hover:text-white" href="/tires/st-trailer">ST Trailer Tires</Link></li>
            <li><Link className="hover:text-white" href="/tires/commercial-truck">Commercial Truck Tires</Link></li>
            <li><Link className="hover:text-white" href="/wheels">Trailer Wheels</Link></li>
            <li><Link className="hover:text-white" href="/parts">Trailer Parts</Link></li>
          </ul>
        </div>
        <div>
          <div className="text-sm font-bold uppercase tracking-wider text-brand">Wholesale</div>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link className="hover:text-white" href="/quote">Request a Quote</Link></li>
            <li><Link className="hover:text-white" href="/become-a-dealer">Become a Dealer</Link></li>
          </ul>
        </div>
        <div>
          <div className="text-sm font-bold uppercase tracking-wider text-brand">Consumers</div>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link className="hover:text-white" href="/find-installation">Find Installation</Link></li>
            <li><Link className="hover:text-white" href="/knowledge">Knowledge Center</Link></li>
            <li><Link className="hover:text-white" href="/tools/tire-size-calculator">Tire Size Calculator</Link></li>
          </ul>
          <p className="mt-4 text-xs text-steel-400">{brand.networkName}</p>
        </div>
      </div>
      <p className="px-4 text-center text-xs text-steel-400">
        © {new Date().getFullYear()} {brand.legalName}. Wholesale pricing requires an approved dealer account.
      </p>
    </footer>
  );
}
