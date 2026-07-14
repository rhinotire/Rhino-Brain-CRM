import type { Metadata } from "next";
import Link from "next/link";
import { SizeConverter } from "@/components/size-converter";
import { JsonLd } from "@/components/json-ld";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Tire Size Converter — Metric ↔ Inch (33X12.50R20 = 285/75R20?)",
  description:
    "Convert between metric (285/75R16) and inch/flotation (33X12.50R20) tire sizes. Real dimensions plus the closest standard equivalents on your rim, ranked by diameter.",
  alternates: { canonical: "/tools/tire-size-converter" },
};

const FAQ = [
  {
    q: "What does 33X12.50R20 mean in metric?",
    a: "Flotation sizes read diameter × width on rim, in inches: a 33X12.50R20 is about 33 inches tall and 12.5 inches wide on a 20-inch rim. The closest metric size depends on matching that diameter on the same rim — this converter ranks the standard candidates for you.",
  },
  {
    q: "How do I convert a metric size to inches?",
    a: "Overall diameter = rim diameter + 2 × sidewall, where sidewall = width × aspect ratio. For 285/75R16: 285 mm × 0.75 = 213.75 mm per sidewall, so the tire is roughly 32.8 inches tall — most people call it a \"33.\"",
  },
  {
    q: "Are converted sizes exact matches?",
    a: "Almost never — the two systems use different step sizes, so equivalents differ slightly. Stay within about ±3% of your original overall diameter and always check load rating and clearance.",
  },
];

export default function TireSizeConverterPage() {
  return (
    <div className="pt-8">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
        <Link href="/">Home</Link> / <Link href="/tools">Tools</Link> / Size Converter
      </nav>
      <h1 className="mt-2 text-2xl font-black">Metric ↔ Inch Tire Size Converter</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        Type a size in either system — get its real dimensions and the closest standard sizes in the other system,
        ranked by how well the diameter matches on your rim.
      </p>

      <div className="mt-6">
        <SizeConverter />
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
          url: `${SITE.url}/tools/tire-size-converter`,
        }}
      />
    </div>
  );
}
