import type { Metadata } from "next";
import Link from "next/link";
import { getBrand, brandAddressLine } from "@/lib/brand";
import { COPY } from "@/lib/brand-copy";

/**
 * About page (master instruction §6.9): factual, entity-based, GEO-friendly —
 * "Who we serve" / "What we supply" / "Why businesses choose us" blocks. No
 * invented history, counts, or awards (owner has confirmed none yet).
 */
export const metadata: Metadata = {
  title: `About ${COPY.name} — Wholesale Tire & Wheel Distributor`,
  description: COPY.aboutLede,
  alternates: { canonical: "/about" },
};

const SERVE = [
  "Independent tire shops and dealers",
  "Trailer manufacturers and trailer dealers",
  "Auto and truck repair shops",
  "Fleet operators — trucking, construction, landscaping, delivery",
  "Mobile tire services and roadside operators",
  "Wheel and accessory resellers",
];

const SUPPLY = [
  ["ST trailer tires", "/tires/st-trailer"],
  ["Passenger tires", "/tires/passenger"],
  ["Light truck tires", "/tires/light-truck"],
  ["Commercial truck tires", "/tires/commercial-truck"],
  ["Trailer, off-road and custom wheels", "/wheels"],
  ["Mounted tire & wheel assemblies", "/packages"],
  ["Trailer parts — hubs, axles, bearing kits", "/parts"],
] as const;

export default async function AboutPage() {
  const brand = await getBrand();
  return (
    <div className="pt-8">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
        <Link href="/">Home</Link> / About
      </nav>
      <h1 className="mt-2 text-2xl font-black">About {COPY.name}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-700">{COPY.aboutLede}</p>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-700">
        We operate on a simple model: keep the sizes our customers turn every week in stock, quote fast, and support the
        businesses that buy from us — {COPY.dealerQualifyLine}. Pricing is dealer-tier and quote-based; there are no retail
        prices on this site.
      </p>

      <div className="mt-10 grid gap-8 md:grid-cols-2">
        <section>
          <h2 className="text-lg font-black text-navy-900">Who we serve</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-slate-700">
            {SERVE.map((s) => (
              <li key={s}>{s}</li>
            ))}
            <li>
              Consumers who need tires installed — see{" "}
              <Link href="/find-installation" className="font-bold text-brand-dark">Find Installation</Link>
            </li>
          </ul>
        </section>
        <section>
          <h2 className="text-lg font-black text-navy-900">Products we supply</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-slate-700">
            {SUPPLY.map(([label, href]) => (
              <li key={href}>
                <Link href={href} className="hover:text-brand-dark hover:underline">{label}</Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mt-10 max-w-2xl">
        <h2 className="text-lg font-black text-navy-900">Why businesses choose {COPY.name}</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-slate-700">
          <li>Live stock status on every published SKU — what you see on this site is what&apos;s in the warehouse</li>
          <li>Dealer tier pricing (A–D) with fast quote turnaround</li>
          <li>{COPY.dealerWarehouseBenefit}</li>
          <li>Pallet and container programs, mixed loads welcome</li>
          <li>{COPY.dealerReferralBenefit}</li>
        </ul>
      </section>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/quote" className="btn-gold">Request a Quote</Link>
        <Link href="/become-a-dealer" className="btn-navy">Open a Dealer Account</Link>
        <Link href="/contact" className="btn-navy">Contact Us</Link>
      </div>
      <p className="mt-6 text-sm text-slate-600">
        {brand.legalName} · {brandAddressLine(brand)} ·{" "}
        <a href={`tel:${brand.phone}`} className="font-bold">{brand.phoneDisplay}</a>
      </p>
    </div>
  );
}
