import type { Metadata } from "next";
import Link from "next/link";
import { TrailerLoadCalculator } from "@/components/trailer-load-calculator";
import { JsonLd } from "@/components/json-ld";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Trailer Tire Load Calculator — What Load Range Do I Need?",
  description:
    "Enter your trailer's GVWR, axles and hitch type — get the per-tire capacity and load index you need, with the 20% heat reserve professionals use. Free, no sign-up.",
  alternates: { canonical: "/tools/trailer-load-calculator" },
};

const FAQ = [
  {
    q: "Why do trailer tires need reserve capacity?",
    a: "Heat is the number-one trailer tire killer. A tire running at 100% of its rated load builds heat fast, especially at highway speed in summer. The widely-taught rule is to spec tires so your real load uses no more than about 80% of their combined capacity — that 20% reserve is built into this calculator.",
  },
  {
    q: "Where do I find my trailer's GVWR?",
    a: "On the VIN/certification plate, usually riveted to the trailer frame near the tongue. GVWR is the maximum loaded weight the trailer is rated for — trailer plus everything on it.",
  },
  {
    q: "What's the difference between Load Range C, D and E?",
    a: "Load range letters reflect the tire's strength (ply rating): C = 6-ply, D = 8-ply, E = 10-ply. A higher letter carries more weight at a higher maximum pressure — the exact capacity in pounds is molded into the sidewall of every tire.",
  },
  {
    q: "Can I use passenger car tires on a trailer?",
    a: "No. ST (Special Trailer) tires have stiffer sidewalls and higher-strength construction for towing loads. Passenger tires are not designed for trailer service and can overheat and fail.",
  },
];

export default function TrailerLoadCalculatorPage() {
  return (
    <div className="pt-8">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
        <Link href="/">Home</Link> / <Link href="/tools">Tools</Link> / Trailer Load Calculator
      </nav>
      <h1 className="mt-2 text-2xl font-black">Trailer Tire Load Calculator</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        How much does each tire need to carry? Enter your trailer&apos;s weight, axles and hitch type — we&apos;ll do the
        math, including the <span className="font-semibold">20% heat reserve</span> professionals spec by.
      </p>

      <div className="mt-6">
        <TrailerLoadCalculator />
      </div>

      <section className="mt-10 max-w-3xl">
        <h2 className="text-lg font-bold">Common questions</h2>
        {FAQ.map((f) => (
          <div key={f.q} className="mt-4">
            <h3 className="font-bold text-navy-900">{f.q}</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">{f.a}</p>
          </div>
        ))}
        <p className="mt-6 text-xs text-slate-400">
          This calculator provides general guidance using industry-standard math. Always verify the maximum load and
          pressure molded into your tire&apos;s sidewall and your trailer manufacturer&apos;s specifications.
        </p>
      </section>

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
          url: `${SITE.url}/tools/trailer-load-calculator`,
        }}
      />
    </div>
  );
}
