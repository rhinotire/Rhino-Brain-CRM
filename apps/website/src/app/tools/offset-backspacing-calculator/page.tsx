import type { Metadata } from "next";
import Link from "next/link";
import { OffsetBackspacing } from "@/components/offset-backspacing";
import { JsonLd } from "@/components/json-ld";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Wheel Offset ↔ Backspacing Calculator — With Live Diagram",
  description:
    "Convert wheel offset (mm) to backspacing (inches) and back, with a live cross-section diagram that shows exactly where the hub face sits. Trailer and custom wheels.",
  alternates: { canonical: "/tools/offset-backspacing-calculator" },
};

const FAQ = [
  {
    q: "What's the difference between offset and backspacing?",
    a: "Both describe where the wheel's mounting face sits. Offset is measured from the wheel's centerline in millimeters (positive = toward the street side). Backspacing is measured from the back flange to the mounting face in inches. Same information, two conventions — trailer and off-road catalogs love backspacing, import and passenger catalogs love offset.",
  },
  {
    q: "How do I convert offset to backspacing?",
    a: "Backspacing = (wheel width + 1) ÷ 2 + offset ÷ 25.4. The +1 inch accounts for the flanges on each side of the bead width. Example: an 8-inch-wide wheel with 0 offset has 4.5 inches of backspacing.",
  },
  {
    q: "What offset do trailer wheels use?",
    a: "Almost all standard trailer wheels are zero offset — the mounting face sits on the centerline, so backspacing is simply half the overall width. That keeps the load centered over the bearings.",
  },
  {
    q: "Will a different offset rub?",
    a: "More negative offset pushes the wheel outward (fender side); more positive pulls it inward (suspension and caliper side). Staying within about ±5 mm of stock is generally safe; beyond that, check caliper, suspension and fender clearance — and remember bearing loads grow as the wheel moves outboard.",
  },
];

export default function OffsetBackspacingPage() {
  return (
    <div className="pt-8">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
        <Link href="/">Home</Link> / <Link href="/tools">Tools</Link> / Offset ↔ Backspacing
      </nav>
      <h1 className="mt-2 text-2xl font-black">Wheel Offset ↔ Backspacing Calculator</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        Two ways of saying the same thing — where the hub face sits in the wheel. Type either number and watch the
        diagram move.
      </p>

      <div className="mt-6">
        <OffsetBackspacing />
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
          url: `${SITE.url}/tools/offset-backspacing-calculator`,
        }}
      />
    </div>
  );
}
