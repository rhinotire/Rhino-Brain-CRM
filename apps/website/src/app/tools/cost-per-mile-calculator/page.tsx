import type { Metadata } from "next";
import Link from "next/link";
import { CostPerMileCalculator } from "@/components/cost-per-mile-calculator";
import { JsonLd } from "@/components/json-ld";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Tire Cost per Mile Calculator — Fleet Tire & Fuel Economics",
  description:
    "Compare two tires by cost per mile, not sticker price: price ÷ tread life, fleet-wide annual savings, and a quick fuel cost-per-mile check. Free fleet tool.",
  alternates: { canonical: "/tools/cost-per-mile-calculator" },
};

const FAQ = [
  {
    q: "Why buy tires on cost per mile instead of price?",
    a: "Because the sticker price is paid once but the miles are what you sell. A $165 tire that runs 55,000 miles costs $3.00 per 1,000 miles; a $120 tire that runs 30,000 miles costs $4.00 — the \"cheaper\" tire is 33% more expensive to operate. Fleets buy on cost per mile for exactly this reason.",
  },
  {
    q: "How do I know a tire's expected tread life?",
    a: "Use your own scrap records if you have them — miles at removal is the gold standard. Otherwise start from the manufacturer's mileage warranty or your dealer's experience with the line, and refine with your own data.",
  },
  {
    q: "Does tire choice really affect fuel cost?",
    a: "Yes. Rolling resistance varies between tires and rises when pressure is low or alignment is off. On a truck burning thousands of gallons a year, a few percent of fuel economy is real money — which is why tire programs and fuel programs are managed together.",
  },
];

export default function CostPerMileCalculatorPage() {
  return (
    <div className="pt-8">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
        <Link href="/">Home</Link> / <Link href="/tools">Tools</Link> / Cost per Mile
      </nav>
      <h1 className="mt-2 text-2xl font-black">Tire Cost per Mile Calculator</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        The number fleets actually buy on: <span className="font-semibold">price ÷ tread life</span>. Compare two
        tires, see the fleet-wide annual impact, and sanity-check your fuel cost per mile.
      </p>

      <div className="mt-6">
        <CostPerMileCalculator />
      </div>

      <section className="mt-10 max-w-3xl">
        <h2 className="text-lg font-bold">Common questions</h2>
        {FAQ.map((f) => (
          <div key={f.q} className="mt-4">
            <h3 className="font-bold text-navy-900">{f.q}</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">{f.a}</p>
          </div>
        ))}
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
          url: `${SITE.url}/tools/cost-per-mile-calculator`,
        }}
      />
    </div>
  );
}
