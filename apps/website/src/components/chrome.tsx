import Link from "next/link";
import { SITE } from "@/lib/site";

const NAV = [
  { href: "/tires", label: "Tires" },
  { href: "/wheels", label: "Wheels" },
  { href: "/parts", label: "Parts" },
  { href: "/knowledge", label: "Knowledge" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link href="/" className="shrink-0 text-lg font-black tracking-tight">
          RHINO <span className="text-brand">TIRE USA</span>
        </Link>
        <nav className="hidden gap-4 text-sm font-medium md:flex" aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="text-slate-600 hover:text-ink">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <a href={`tel:${SITE.phone}`} className="hidden text-sm font-semibold text-slate-700 sm:block">
            {SITE.phoneDisplay}
          </a>
          <Link
            href="/quote"
            className="rounded-lg bg-brand px-3 py-1.5 text-sm font-bold text-ink hover:bg-brand-dark hover:text-white"
          >
            Get Quote
          </Link>
          <Link href="/become-a-dealer" className="hidden text-sm font-semibold text-slate-700 md:block">
            Become a Dealer
          </Link>
        </div>
      </div>
    </header>
  );
}

/** Mobile sticky bottom bar: Call · Search · Get Quote (docs/sitemap.md). */
export function MobileBar() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t border-slate-200 bg-white text-center text-sm font-semibold md:hidden">
      <a href={`tel:${SITE.phone}`} className="py-3">
        📞 Call
      </a>
      <Link href="/tires" className="border-x border-slate-200 py-3">
        🔍 Browse
      </Link>
      <Link href="/quote" className="bg-brand py-3 text-ink">
        Get Quote
      </Link>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="mt-16 border-t border-slate-200 bg-slate-50 pb-24 md:pb-8">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 md:grid-cols-4">
        <div>
          <div className="text-base font-black">
            RHINO <span className="text-brand">TIRE USA</span>
          </div>
          {/* Standardized NAP — must match GBP and socials exactly */}
          <p className="mt-2 text-sm text-slate-600">
            {SITE.legalName}
            <br />
            {SITE.address.streetAddress}
            <br />
            <a href={`tel:${SITE.phone}`} className="font-semibold">
              {SITE.phoneDisplay}
            </a>
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
          <div className="text-sm font-bold uppercase text-slate-500">Learn</div>
          <ul className="mt-2 space-y-1 text-sm">
            <li><Link href="/knowledge">Knowledge Center</Link></li>
          </ul>
        </div>
      </div>
      <p className="px-4 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} {SITE.legalName}. Wholesale only — dealer pricing requires an approved account.
      </p>
    </footer>
  );
}
