import type { Metadata } from "next";
import Link from "next/link";
import { DotDecoder } from "@/components/dot-decoder";
import { JsonLd } from "@/components/json-ld";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Tire DOT Date Code Decoder — How Old Are My Tires?",
  description:
    "Enter the last 4 digits of your tire's DOT code and get the manufacture date, tire age, and industry age guidance — including the stricter rules for trailer tires.",
  alternates: { canonical: "/tools/dot-date-decoder" },
};

const FAQ = [
  {
    q: "How do I read a tire's DOT date code?",
    a: "The last four digits of the DOT code are the week and year of manufacture: 3523 means week 35 of 2023. The full DOT code appears on the sidewall, though the date group may only be molded on one side of the tire.",
  },
  {
    q: "How old is too old for a tire?",
    a: "Industry guidance: professional inspection every year from age 5, many manufacturers recommend replacement between 6 and 10 years, and 10 years is the widely-accepted maximum regardless of tread depth. Rubber ages even when the tire isn't used.",
  },
  {
    q: "Why do trailer tires age out faster?",
    a: "Trailer tires typically die of age, not mileage: they sit in the sun, carry heavy loads in short bursts, and build heat at highway speed. Most trailer-tire guidance calls for replacement around 5–6 years even with plenty of tread left.",
  },
  {
    q: "My tire has a 3-digit date code — what does that mean?",
    a: "Three-digit date codes were used before the year 2000, which makes the tire more than two decades old. Replace it immediately.",
  },
];

export default function DotDateDecoderPage() {
  return (
    <div className="pt-8">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
        <Link href="/">Home</Link> / <Link href="/tools">Tools</Link> / DOT Date Decoder
      </nav>
      <h1 className="mt-2 text-2xl font-black">Tire DOT Date Code Decoder</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        Every tire&apos;s birthday is molded into its sidewall. Type the last 4 digits of the DOT code — get the
        manufacture date, the tire&apos;s age, and what the industry says about it.
      </p>

      <div className="mt-6">
        <DotDecoder />
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
          url: `${SITE.url}/tools/dot-date-decoder`,
        }}
      />
    </div>
  );
}
