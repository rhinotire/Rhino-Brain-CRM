import type { Metadata } from "next";
import Link from "next/link";
import { getBrand, brandAddressLine } from "@/lib/brand";
import { COPY } from "@/lib/brand-copy";

/**
 * Service-area page (master instruction §6.10): ONE useful page, not doorway
 * pages — city list + how supply actually works per channel. City list is
 * brand-conditional (Florida for RHINO, DFW metroplex for EVERFLOW).
 */
export const metadata: Metadata = {
  title: `${COPY.serviceAreaName} Service Area — Wholesale Tire & Wheel Supply`,
  description: `${COPY.serviceAreaLede} Warehouse pickup, delivery and freight for dealers, fleets and trailer manufacturers.`,
  alternates: { canonical: "/service-area" },
};

export default async function ServiceAreaPage() {
  const brand = await getBrand();
  return (
    <div className="pt-8">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
        <Link href="/">Home</Link> / Service Area
      </nav>
      <h1 className="mt-2 text-2xl font-black">{COPY.serviceAreaName} Service Area</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-700">{COPY.serviceAreaLede}</p>

      <div className="mt-8 grid gap-6 md:grid-cols-3">
        <div className="rounded-2xl border border-steel-200 bg-white p-6 shadow-card">
          <h2 className="font-black text-navy-900">Warehouse pickup</h2>
          <p className="mt-2 text-sm text-slate-700">
            Pick up at {brandAddressLine(brand)}. Call ahead and your order is staged at the dock.
          </p>
        </div>
        <div className="rounded-2xl border border-steel-200 bg-white p-6 shadow-card">
          <h2 className="font-black text-navy-900">Local &amp; regional delivery</h2>
          <p className="mt-2 text-sm text-slate-700">
            {COPY.deliveryStat}. Delivery details are confirmed with your quote based on ZIP and volume.
          </p>
        </div>
        <div className="rounded-2xl border border-steel-200 bg-white p-6 shadow-card">
          <h2 className="font-black text-navy-900">Pallets &amp; containers</h2>
          <p className="mt-2 text-sm text-slate-700">
            Mixed pallets and full containers ship by freight beyond the local area — nationwide for dealer accounts.
          </p>
        </div>
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-black text-navy-900">Cities we serve</h2>
        <p className="mt-1 text-sm text-slate-600">
          Dealers, fleets, repair shops and trailer manufacturers in and around:
        </p>
        <ul className="mt-4 flex max-w-3xl flex-wrap gap-2">
          {COPY.serviceCities.map((c) => (
            <li key={c} className="rounded-full border border-steel-200 bg-white px-3 py-1.5 text-sm text-navy-900">
              {c}
            </li>
          ))}
        </ul>
        <p className="mt-4 max-w-2xl text-sm text-slate-600">
          Not on the list? We still want your business — freight programs reach well beyond it.{" "}
          <Link href="/quote" className="font-bold text-brand-dark">Request a quote</Link> with your delivery ZIP and we&apos;ll
          confirm options.
        </p>
      </section>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/quote" className="btn-gold">Request a Quote</Link>
        <Link href="/become-a-dealer" className="btn-navy">Open a Dealer Account</Link>
        <Link href="/fleet-solutions" className="btn-navy">Fleet Solutions</Link>
      </div>
    </div>
  );
}
