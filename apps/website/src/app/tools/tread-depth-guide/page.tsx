import type { Metadata } from "next";
import Link from "next/link";
import { TreadDepthGuide } from "@/components/tread-depth-guide";
import { JsonLd } from "@/components/json-ld";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Tread Depth Guide — Penny Test, Quarter Test & When to Replace",
  description:
    "Check your tread depth against the legal 2/32\" minimum and the 4/32\" wet-safety line, see the % of usable tread left, and learn the penny and quarter tests.",
  alternates: { canonical: "/tools/tread-depth-guide" },
};

const FAQ = [
  {
    q: "What is the legal minimum tread depth?",
    a: "2/32 of an inch in most states — that's where the built-in wear bars sit flush with the tread. Commercial vehicles are stricter: FMCSA requires 4/32\" on steer tires and 2/32\" everywhere else.",
  },
  {
    q: "How does the penny test work?",
    a: "Insert a penny into a tread groove with Lincoln's head upside down. If you can see the top of his head, the groove is at or below 2/32\" and the tire is legally worn out. A quarter works the same way at 4/32\" — see Washington's head and it's time to shop.",
  },
  {
    q: "Why replace at 4/32 instead of the legal 2/32?",
    a: "Wet braking and hydroplaning resistance fall off a cliff in the last few 32nds — independent testing shows dramatically longer wet stops below 4/32\". The legal limit is a floor, not a recommendation.",
  },
  {
    q: "How deep is a new tire's tread?",
    a: "Typically 10–12/32\" for highway and touring tires, and 13–17/32\" for all-terrain and mud-terrain patterns. Check the spec sheet for your exact model — that's the number to enter as 'depth when new.'",
  },
];

export default function TreadDepthGuidePage() {
  return (
    <div className="pt-8">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
        <Link href="/">Home</Link> / <Link href="/tools">Tools</Link> / Tread Depth Guide
      </nav>
      <h1 className="mt-2 text-2xl font-black">Tread Depth Guide</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        Measure your tread, see where it sits between new and the legal floor, and know exactly when to act — with the
        classic penny and quarter tests.
      </p>

      <div className="mt-6">
        <TreadDepthGuide />
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
          url: `${SITE.url}/tools/tread-depth-guide`,
        }}
      />
    </div>
  );
}
