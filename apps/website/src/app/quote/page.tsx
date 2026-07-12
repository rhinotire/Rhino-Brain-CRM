import type { Metadata } from "next";
import Link from "next/link";
import { QuoteForm } from "@/components/lead-forms";
import { getBrand } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Request a Wholesale Quote",
  description:
    "Get wholesale pricing on tires, wheels and trailer parts. Tell us the sizes and quantities — a rep replies within one business day.",
  alternates: { canonical: "/quote" },
};

export default async function QuotePage({ searchParams }: { searchParams: { sku?: string } }) {
  const brand = await getBrand();
  return (
    <div className="pt-8">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
        <Link href="/">Home</Link> / Get a Quote
      </nav>
      <h1 className="mt-2 text-2xl font-black">Request a Wholesale Quote</h1>
      <p className="mt-2 max-w-xl text-sm text-slate-600">
        Sizes, quantities, delivery ZIP — that&apos;s all we need. Prefer phone or email? Call{" "}
        <a href={`tel:${brand.phone}`} className="font-bold">{brand.phoneDisplay}</a>
        {brand.contactEmail && (
          <> or write to <a href={`mailto:${brand.contactEmail}`} className="font-bold text-brand-dark">{brand.contactEmail}</a></>
        )}.
      </p>
      <QuoteForm defaultSku={searchParams.sku} />
    </div>
  );
}
