import type { Metadata } from "next";
import Link from "next/link";
import { TempPressureCalculator } from "@/components/temp-pressure-calculator";
import { JsonLd } from "@/components/json-ld";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Tire Pressure & Temperature Calculator — PSI Change by Season",
  description:
    "How much PSI does your tire lose when it gets cold? Real gas-law math, not just the 1-psi-per-10°F rule — with a seasonal table and trailer tire guidance.",
  alternates: { canonical: "/tools/temperature-pressure-calculator" },
};

const FAQ = [
  {
    q: "How much pressure does a tire lose in cold weather?",
    a: "About 2% of its pressure for every 10°F drop — roughly 1 PSI on a 35-psi passenger tire, but closer to 1.3–1.5 PSI on a 65-psi trailer tire and 2 PSI on a 100-psi commercial tire. The percentage rule (real gas law) is what this calculator uses.",
  },
  {
    q: "Why did my TPMS light come on the first cold morning?",
    a: "Pressures set in warm weather drop with the season: air set at 75°F reads noticeably lower at 30°F. Nothing is leaking — but the tire really is underinflated now, so top it up at the colder temperature.",
  },
  {
    q: "What pressure should trailer tires run?",
    a: "Unless the trailer manufacturer specifies otherwise, ST trailer tires run at the maximum pressure molded on the sidewall — their load capacity is rated at that pressure, and underinflation is the leading cause of heat-related trailer tire failures.",
  },
  {
    q: "Should I check pressure hot or cold?",
    a: "Cold — before driving, or after the vehicle has sat for 3+ hours. Driving heats the air and raises the reading, which masks underinflation.",
  },
];

export default function TemperaturePressureCalculatorPage() {
  return (
    <div className="pt-8">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
        <Link href="/">Home</Link> / <Link href="/tools">Tools</Link> / Temperature &amp; Pressure
      </nav>
      <h1 className="mt-2 text-2xl font-black">Tire Pressure &amp; Temperature Calculator</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        Air shrinks when it&apos;s cold. See what your tires will actually read when the weather turns — and why the
        first cold snap is blowout season for trailers.
      </p>

      <div className="mt-6">
        <TempPressureCalculator />
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
          url: `${SITE.url}/tools/temperature-pressure-calculator`,
        }}
      />
    </div>
  );
}
