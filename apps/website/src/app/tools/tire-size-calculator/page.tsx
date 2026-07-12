import type { Metadata } from "next";
import Link from "next/link";
import { TireSizeCalculator } from "@/components/tire-size-calculator";
import { JsonLd } from "@/components/json-ld";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Tire Size Calculator & Comparison — Diameter, Speedometer Error",
  description:
    "Compare two tire sizes side by side: overall diameter, sidewall, circumference, revs per mile and speedometer error. Supports ST trailer and LT sizes.",
  alternates: { canonical: "/tools/tire-size-calculator" },
};

export default function TireCalcPage() {
  return (
    <div className="pt-8">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
        <Link href="/">Home</Link> / <Link href="/tools">Tools</Link> / Tire Size Calculator
      </nav>
      <h1 className="mt-2 text-2xl font-black">Tire Size Calculator &amp; Comparison</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        Compare any two tire sizes — including ST trailer and LT sizes. See exactly how diameter, sidewall and
        revolutions per mile change, and what your speedometer will really read.
      </p>

      <div className="mt-6">
        <TireSizeCalculator />
      </div>

      {/* GEO: quotable explanations under the tool */}
      <section className="mt-10 max-w-2xl space-y-4 text-[15px] leading-relaxed">
        <h2 className="text-lg font-bold">How to read the results</h2>
        <p>
          The industry rule of thumb is to stay within <strong>±3% of your original overall diameter</strong>. Beyond
          that, your speedometer and odometer error becomes noticeable, gearing changes, and on trailers the tire can
          contact fenders or frame under load.
        </p>
        <h2 className="text-lg font-bold">Why revolutions per mile matters for trailers</h2>
        <p>
          A smaller-diameter tire turns more times per mile, which runs hotter at highway speed — and heat is the
          number-one killer of trailer tires in Florida. When upsizing from ST205/75R15 toward ST235/80R16, you gain
          diameter and load capacity while lowering revs per mile, which is why 16&quot; load range E is our most
          stocked trailer size.
        </p>
        <p className="rounded-xl bg-slate-50 p-4 text-sm">
          Need the tires once you&apos;ve picked a size?{" "}
          <Link href="/quote" className="font-bold text-brand-dark">Get a wholesale quote</Link> or{" "}
          <Link href="/find-installation" className="font-bold text-brand-dark">find installation near you</Link>.
        </p>
      </section>

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "Tire Size Calculator & Comparison",
          url: `${SITE.url}/tools/tire-size-calculator`,
          applicationCategory: "UtilityApplication",
          operatingSystem: "Web",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          publisher: { "@type": "Organization", name: SITE.name },
        }}
      />
    </div>
  );
}
