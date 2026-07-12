import Link from "next/link";
import type { Brand } from "@/lib/brand";

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
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link href="/" className="shrink-0">
          {brand.logoUrl ? (
            // owner-uploaded logo (CRM → Settings → Website Brand)
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logoUrl} alt={brand.name} className="h-10 w-auto max-w-[220px] object-contain sm:h-11" />
          ) : brand.key === "EVERFLOW" ? (
            <span className="text-lg font-black tracking-tight">EVERFLOW <span className="text-brand">TIRES</span></span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/rhino-logo.svg" alt="Rhino Tires USA" className="h-10 w-auto max-w-[200px] object-contain sm:h-11" />
          )}
        </Link>
        <nav className="hidden gap-4 text-sm font-medium md:flex" aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="text-slate-600 hover:text-ink">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <a href={`tel:${brand.phone}`} className="hidden text-sm font-semibold text-slate-700 sm:block">
            {brand.phoneDisplay}
          </a>
          <Link
            href="/quote"
            className="rounded-lg bg-brand px-3 py-1.5 text-sm font-bold text-ink hover:bg-brand-dark hover:text-white"
          >
            Get Quote
          </Link>
          <Link href="/become-a-dealer" className="hidden text-sm font-semibold text-slate-700 md:block">
            Dealer Program
          </Link>
        </div>
      </div>
      {/* Dual-channel strip — both paths always visible (spec §5, non-negotiable) */}
      <div className="border-t border-slate-100 bg-slate-50">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-1.5 text-xs">
          <span className="font-semibold text-slate-500">
            Buying for your business?{" "}
            <Link href="/tires" className="text-brand-dark underline">Search wholesale inventory</Link>
            {" · "}
            <Link href="/become-a-dealer" className="text-brand-dark underline">Dealer program</Link>
          </span>
          <span className="font-semibold text-slate-500">
            Need tires installed?{" "}
            <Link href="/find-installation" className="text-brand-dark underline">Find installation near me</Link>
          </span>
        </div>
      </div>
    </header>
  );
}

/** Mobile sticky bottom bar: Call · Find Installer · Get Quote (spec §6). */
export function MobileBar({ brand }: { brand: Brand }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t border-slate-200 bg-white text-center text-sm font-semibold md:hidden">
      <a href={`tel:${brand.phone}`} className="py-3">
        📞 Call
      </a>
      <Link href="/find-installation" className="border-x border-slate-200 py-3">
        🔧 Find Installer
      </Link>
      <Link href="/quote" className="bg-brand py-3 text-ink">
        Get Quote
      </Link>
    </div>
  );
}

export function Footer({ brand }: { brand: Brand }) {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-slate-50 pb-24 md:pb-8">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 md:grid-cols-4">
        <div>
          <div className="text-base font-black">{brand.name.toUpperCase()}</div>
          {/* Standardized NAP — must match GBP and socials exactly */}
          <p className="mt-2 text-sm text-slate-600">
            {brand.legalName}
            <br />
            {brand.address.streetAddress}
            <br />
            <a href={`tel:${brand.phone}`} className="font-semibold">
              {brand.phoneDisplay}
            </a>
            {brand.contactEmail && (
              <>
                <br />
                <a href={`mailto:${brand.contactEmail}`} className="font-semibold text-brand-dark hover:underline">
                  {brand.contactEmail}
                </a>
              </>
            )}
          </p>
        </div>
        <div>
          <div className="text-sm font-bold uppercase text-slate-500">Products</div>
          <ul className="mt-2 space-y-1 text-sm">
            <li><Link href="/tires/st-trailer">ST Trailer Tires</Link></li>
            <li><Link href="/tires/commercial-truck">Commercial Truck Tires</Link></li>
            <li><Link href="/wheels">Trailer Wheels</Link></li>
            <li><Link href="/parts">Trailer Parts</Link></li>
          </ul>
        </div>
        <div>
          <div className="text-sm font-bold uppercase text-slate-500">Wholesale</div>
          <ul className="mt-2 space-y-1 text-sm">
            <li><Link href="/quote">Request a Quote</Link></li>
            <li><Link href="/become-a-dealer">Become a Dealer</Link></li>
          </ul>
        </div>
        <div>
          <div className="text-sm font-bold uppercase text-slate-500">Consumers</div>
          <ul className="mt-2 space-y-1 text-sm">
            <li><Link href="/find-installation">Find Installation</Link></li>
            <li><Link href="/knowledge">Knowledge Center</Link></li>
            <li><Link href="/tools/tire-size-calculator">Tire Size Calculator</Link></li>
          </ul>
          <p className="mt-3 text-xs text-slate-400">{brand.networkName}</p>
        </div>
      </div>
      <p className="px-4 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} {brand.legalName}. Wholesale pricing requires an approved dealer account.
      </p>
    </footer>
  );
}
