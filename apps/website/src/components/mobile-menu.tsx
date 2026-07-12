"use client";

import { useState } from "react";
import Link from "next/link";

type Item = { href: string; label: string };

/** Mobile slide-down menu — the full nav is reachable on phones. */
export function MobileMenu({ nav, phone, phoneDisplay }: { nav: Item[]; phone: string; phoneDisplay: string }) {
  const [open, setOpen] = useState(false);
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
        <div id="mobile-nav" className="absolute inset-x-0 top-full z-50 border-b border-steel-200 bg-white shadow-lift">
          <nav className="mx-auto max-w-6xl px-4 py-3" aria-label="Mobile">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-3 text-base font-semibold text-navy-900 hover:bg-steel-100">
                {n.label}
              </Link>
            ))}
            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-steel-200 pt-3">
              <Link href="/quote" onClick={() => setOpen(false)} className="btn-gold text-center">Get Wholesale Quote</Link>
              <Link href="/find-installation" onClick={() => setOpen(false)} className="btn-navy text-center">Find Installation</Link>
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
