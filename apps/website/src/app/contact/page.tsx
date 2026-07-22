import type { Metadata } from "next";
import Link from "next/link";
import { getBrand, brandAddressLine } from "@/lib/brand";
import { COPY } from "@/lib/brand-copy";

/**
 * Contact page (master instruction §6.12): NAP from BrandConfig (editable in
 * the CRM without a deploy), embedded map, directions CTA. Business hours are
 * intentionally absent until the owner configures them.
 */
export const metadata: Metadata = {
  title: "Contact Us",
  description: `Call, email, or visit ${COPY.name}. Wholesale quotes answered within one business day.`,
  alternates: { canonical: "/contact" },
};

export default async function ContactPage() {
  const brand = await getBrand();
  const fullAddress = brandAddressLine(brand);
  const mapsQuery = encodeURIComponent(`${brand.legalName}, ${fullAddress}`);
  return (
    <div className="pt-8">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
        <Link href="/">Home</Link> / Contact
      </nav>
      <h1 className="mt-2 text-2xl font-black">Contact {COPY.name}</h1>

      <div className="mt-6 grid gap-8 md:grid-cols-2">
        <div>
          <div className="rounded-2xl border border-steel-200 bg-white p-6 shadow-card">
            <p className="text-sm font-bold uppercase tracking-wider text-brand-dark">Warehouse &amp; office</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-700">
              {brand.legalName}
              <br />
              {fullAddress}
            </p>
            <p className="mt-4 text-sm">
              <a href={`tel:${brand.phone}`} className="text-lg font-black text-navy-900">{brand.phoneDisplay}</a>
              {brand.contactEmail && (
                <>
                  <br />
                  <a href={`mailto:${brand.contactEmail}`} className="font-bold text-brand-dark">{brand.contactEmail}</a>
                </>
              )}
            </p>
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${mapsQuery}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-navy mt-5 inline-block"
            >
              Get Directions
            </a>
          </div>

          <div className="mt-6 space-y-3 text-sm text-slate-700">
            <p>
              <span className="font-bold text-navy-900">Need pricing?</span> The fastest path is the{" "}
              <Link href="/quote" className="font-bold text-brand-dark">quote form</Link> — sizes, quantities, delivery ZIP, and a
              rep replies within one business day.
            </p>
            <p>
              <span className="font-bold text-navy-900">Want a dealer account?</span>{" "}
              <Link href="/become-a-dealer" className="font-bold text-brand-dark">Apply here</Link> for tier pricing —{" "}
              approval usually takes one business day.
            </p>
            <p>
              <span className="font-bold text-navy-900">Consumer looking for installation?</span>{" "}
              <Link href="/find-installation" className="font-bold text-brand-dark">Enter your size and ZIP</Link> and we&apos;ll
              show professional options near you.
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-steel-200 shadow-card">
          <iframe
            title={`Map to ${COPY.name}`}
            src={`https://www.google.com/maps?q=${mapsQuery}&output=embed`}
            className="h-[380px] w-full md:h-full"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </div>
    </div>
  );
}
