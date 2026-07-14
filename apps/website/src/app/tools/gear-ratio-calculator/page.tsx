import type { Metadata } from "next";
import Link from "next/link";
import { GearRatioCalculator } from "@/components/gear-ratio-calculator";
import { JsonLd } from "@/components/json-ld";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Gear Ratio & RPM Calculator — Re-Gear for Bigger Tires (33s, 35s, 37s)",
  description:
    "Went to bigger tires? See your new cruise RPM, the effective gear ratio you're really running, and the re-gear that brings back stock performance — 33s, 35s, 37s.",
  alternates: { canonical: "/tools/gear-ratio-calculator" },
};

const FAQ = [
  {
    q: "Why does my truck feel slow after bigger tires?",
    a: "Bigger tires effectively raise your gearing: a 3.73 axle with 35s on a truck that came with 31s behaves like roughly a 3.30. The engine turns fewer RPM per mile, so acceleration, towing and sometimes fuel economy in hills all suffer until you re-gear.",
  },
  {
    q: "What gear ratio do I need after going to 35s?",
    a: "Multiply your current ratio by (new diameter ÷ old diameter). From a 31-inch tire to a 35 on 3.73 gears: 3.73 × 35/31 ≈ 4.21, so most people pick 4.10 for highway bias or 4.30–4.56 for towing and off-road. The calculator does this for your exact sizes.",
  },
  {
    q: "How do I find my axle gear ratio?",
    a: "Check the door-jamb or glove-box axle code, the tag or stamp on the differential cover, or count driveshaft turns per wheel revolution (with the other wheel locked). Your dealer can also decode it from the VIN.",
  },
  {
    q: "What is the top-gear (overdrive) ratio?",
    a: "The transmission's highest-gear ratio. Overdrives are below 1.00 (0.70 is typical); direct-drive top gear is 1.00. It multiplies with the axle ratio to set cruise RPM.",
  },
];

export default function GearRatioCalculatorPage() {
  return (
    <div className="pt-8">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
        <Link href="/">Home</Link> / <Link href="/tools">Tools</Link> / Gear Ratio &amp; RPM
      </nav>
      <h1 className="mt-2 text-2xl font-black">Gear Ratio &amp; RPM Calculator</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        Bigger tires change everything downstream of the engine. Enter your old and new sizes — see the RPM drop, the
        gearing you&apos;re effectively running now, and the re-gear that brings it back.
      </p>

      <div className="mt-6">
        <GearRatioCalculator />
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
          url: `${SITE.url}/tools/gear-ratio-calculator`,
        }}
      />
    </div>
  );
}
