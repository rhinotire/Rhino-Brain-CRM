import type { Metadata } from "next";
import Link from "next/link";
import { QuoteForm } from "@/components/lead-forms";
import { SITE } from "@/lib/site";
import { COPY } from "@/lib/brand-copy";

export const metadata: Metadata = {
  title: "Dealer Quick Order — Paste Your List, Get a Quote",
  description: `Dealers: paste your size/SKU list with quantities and get a tier-priced quote back fast. Pallet and container programs from ${COPY.wh}.`,
  alternates: { canonical: "/dealer/quick-order" },
};

export default function DealerQuickOrderPage() {
  return (
    <div className="pt-8">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
        <Link href="/">Home</Link> / Dealer Quick Order
      </nav>
      <h1 className="mt-2 text-2xl font-black">Dealer Quick Order</h1>
      <p className="mt-2 max-w-2xl text-sm text-steel-500">
        Paste your whole list — one line per item, sizes or SKUs with quantities. Your rep prices it at your tier and
        sends the quote back, usually the same business day.
      </p>

      <div className="mt-4 max-w-xl rounded-xl bg-steel-100 p-4 font-mono text-xs leading-relaxed text-navy-800">
        ST205/75R15 x 100<br />
        ST225/75R15 LRE x 48<br />
        15X6 white spoke 5x4.5 x 24<br />
        11R22.5 drive x 8
      </div>

      <QuoteForm />

      <p className="mt-6 text-sm text-steel-500">
        Prefer to talk? Call <a href={`tel:${SITE.phone}`} className="font-bold text-brand-dark">{SITE.phoneDisplay}</a>.
        No account yet? <Link href="/become-a-dealer" className="font-bold text-brand-dark">Apply for dealer pricing</Link>.
      </p>
    </div>
  );
}
