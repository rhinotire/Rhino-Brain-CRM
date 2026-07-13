"use client";

import { useState } from "react";
import Link from "next/link";

type Item = { href: string; label: string; mega?: boolean };
type MegaCol = { title: string; items: { href: string; label: string; blurb?: string }[] };

/** Mobile slide-down menu — the full nav is reachable on phones. */
export function MobileMenu({ nav, tiresMega, phone, phoneDisplay }: {
  nav: Item[]; tiresMega: MegaCol[]; phone: string; phoneDisplay: string;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="mobile-nav"
        className="flex h-10 w-10 items-center justify-center rounded-lg border border-steel-200"
        onClick={() => setOpen(!open)}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      {open && (
        <div id="mobile-nav" className="absolute inset-x-0 top-full z-50 max-h-[75vh] overflow-y-auto border-b border-steel-200 bg-white shadow-lift">
          <nav className="mx-auto max-w-6xl px-4 py-3" aria-label="Mobile">
            {nav.map((n) =>
              n.mega ? (
                <div key={n.href}>
                  <Link href={n.href} onClick={close}
                    className="block rounded-lg px-3 py-3 text-base font-semibold text-navy-900 hover:bg-steel-100">
                    {n.label}
                  </Link>
                  <div className="ml-3 border-l-2 border-steel-200 pl-2">
                    {tiresMega.flatMap((col) => col.items).map((it) => (
                      <Link key={it.href} href={it.href} onClick={close}
                        className="block rounded-lg px-3 py-2 text-sm font-medium text-navy-800 hover:bg-steel-100">
                        {it.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : (
                <Link key={n.href} href={n.href} onClick={close}
                  className="block rounded-lg px-3 py-3 text-base font-semibold text-navy-900 hover:bg-steel-100">
                  {n.label}
                </Link>
              )
            )}
            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-steel-200 pt-3">
              <Link href="/quote" onClick={close} className="btn-gold text-center">Get Wholesale Quote</Link>
              <Link href="/find-installation" onClick={close} className="btn-navy text-center">Find Installation</Link>
            </div>
            <a href={`tel:${phone}`} className="mt-3 block text-center text-sm font-bold text-navy-900">
              📞 {phoneDisplay}
            </a>
          </nav>
        </div>
      )}
    </div>
  );
}
