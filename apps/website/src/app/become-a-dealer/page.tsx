import type { Metadata } from "next";
import Link from "next/link";
import { DealerForm } from "@/components/lead-forms";
import { getBrand } from "@/lib/brand";
import { COPY } from "@/lib/brand-copy";

export const metadata: Metadata = {
  title: "Become a Dealer — Wholesale Account Application",
  description: COPY.dealerMetaDescription,
  alternates: { canonical: "/become-a-dealer", languages: { en: "/become-a-dealer", es: "/es/become-a-dealer" } },
};

export default async function DealerPage() {
  const brand = await getBrand();
  return (
    <div className="pt-8">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
        <Link href="/">Home</Link> / Become a Dealer
      </nav>
      <h1 className="mt-2 text-2xl font-black">Become a Dealer</h1>
      <ul className="mt-4 max-w-xl list-disc space-y-1 pl-5 text-sm text-slate-700">
        <li>Dealer tier pricing (A–D) on the full catalog</li>
        <li>{COPY.dealerWarehouseBenefit}</li>
        <li>Pallet and container programs, mixed loads welcome</li>
        <li>{COPY.dealerReferralBenefit}</li>
      </ul>
      <p className="mt-3 max-w-xl text-sm text-slate-600">
        Questions before applying? Call <a href={`tel:${brand.phone}`} className="font-bold">{brand.phoneDisplay}</a>
        {brand.contactEmail && (
          <> or email <a href={`mailto:${brand.contactEmail}`} className="font-bold text-brand-dark">{brand.contactEmail}</a></>
        )}.
      </p>
      <DealerForm />
    </div>
  );
}
