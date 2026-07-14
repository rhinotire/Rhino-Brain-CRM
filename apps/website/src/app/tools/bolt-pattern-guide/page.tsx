import type { Metadata } from "next";
import Link from "next/link";
import { BoltPatternGuide } from "@/components/bolt-pattern-guide";
import { JsonLd } from "@/components/json-ld";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Trailer Bolt Pattern Guide — How to Measure Lug Patterns (5x4.5, 6x5.5…)",
  description:
    "How to measure a wheel bolt pattern the right way — even and odd lug counts, an exact neighbor-spacing calculator, and the standard trailer patterns in inches and millimeters.",
  alternates: { canonical: "/tools/bolt-pattern-guide" },
};

const FAQ = [
  {
    q: "What does 5x4.5 mean?",
    a: "Five lug holes arranged on a circle 4.5 inches across — also written 5 on 4½ or 5x114.3 in millimeters. The first number is the lug count, the second is the bolt circle diameter.",
  },
  {
    q: "How do I measure a 5-lug bolt pattern?",
    a: "Five lugs have no hole directly across, so measure from the center of one hole to the far edge of the hole two positions over. For an exact answer, measure center-to-center between two neighboring holes and multiply by 1.7013 — or use the calculator on this page.",
  },
  {
    q: "Are 5x4.5 and 5x114.3 the same?",
    a: "Yes — 4.5 inches equals 114.3 millimeters. The same pattern is labeled either way depending on the market.",
  },
  {
    q: "Can I run a wheel with a different bolt pattern?",
    a: "No. The wheel's bolt pattern must match the hub exactly. Adapters exist but add complexity and are generally not recommended for trailers carrying load.",
  },
];

export default function BoltPatternGuidePage() {
  return (
    <div className="pt-8">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
        <Link href="/">Home</Link> / <Link href="/tools">Tools</Link> / Bolt Pattern Guide
      </nav>
      <h1 className="mt-2 text-2xl font-black">Trailer Bolt Pattern Guide</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        The bolt pattern (like <span className="font-mono font-semibold">5x4.5</span>) is the lug count plus the
        diameter of the circle the holes sit on. Here&apos;s how to measure it right the first time.
      </p>

      <div className="mt-6">
        <BoltPatternGuide />
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
          url: `${SITE.url}/tools/bolt-pattern-guide`,
        }}
      />
    </div>
  );
}
