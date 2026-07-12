import Link from "next/link";
import type { Brand } from "@/lib/brand";
import { MobileMenu } from "@/components/mobile-menu";

const NAV = [
  { href: "/tires", label: "Tires" },
  { href: "/wheels", label: "Wheels" },
  { href: "/parts", label: "Parts" },
  { href: "/find-installation", label: "Find Installation" },
  { href: "/tools", label: "Tools" },
  { href: "/knowledge", label: "Knowledge" },
];

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
        <nav className="hidden gap-6 md:flex" aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href}
              className="border-b-2 border-transparent py-1 text-[15px] font-semibold text-navy-800 transition hover:border-brand hover:text-navy-900">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <Link href="/become-a-dealer" className="hidden text-sm font-bold text-navy-800 hover:text-brand-dark lg:block">
            Dealer Program
          </Link>
          <Link href="/quote" className="btn-gold hidden !py-2.5 md:inline-block">Get Quote</Link>
          <MobileMenu nav={NAV} phone={brand.phone} phoneDisplay={brand.phoneDisplay} />
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
