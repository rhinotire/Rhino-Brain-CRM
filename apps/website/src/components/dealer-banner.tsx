import Link from "next/link";
import { dealerLogout } from "@/app/dealer/login/dealer-actions";
import { CartCount } from "@/components/dealer-cart";
import type { DealerSession } from "@/lib/dealer-session";

const TABS = [
  { href: "/dealer/catalog", label: "Catalog" },
  { href: "/dealer/cart", label: "Cart", badge: true },
  { href: "/dealer/orders", label: "My Orders" },
  { href: "/dealer/quick-order", label: "Quick Order" },
];

/** Portal header: company identity + portal navigation. Shown on every dealer page. */
export function DealerBanner({ session, active }: { session: DealerSession; active?: string }) {
  return (
    <div className="mt-4 rounded-xl bg-navy-900 text-white">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-2.5">
        <p className="text-xs">
          <span className="text-[10px] font-bold uppercase tracking-widest text-brand-light">Dealer Portal</span>
          <span className="ml-2 font-bold">{session.companyName}</span>
        </p>
        <form action={dealerLogout}>
          <button className="text-xs font-bold text-steel-300 underline-offset-2 hover:text-white hover:underline">Sign out</button>
        </form>
      </div>
      <nav className="mt-1 flex gap-1 px-2 pb-0" aria-label="Dealer portal">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href}
            className={`rounded-t-lg px-3.5 py-2 text-xs font-bold uppercase tracking-wide ${active === t.href ? "bg-white text-navy-900" : "text-steel-300 hover:bg-navy-800 hover:text-white"}`}>
            {t.label}
            {t.badge && <CartCount />}
          </Link>
        ))}
      </nav>
    </div>
  );
}
