import type { Metadata } from "next";
import Link from "next/link";
import { StaggeredCalculator } from "@/components/staggered-calculator";
import { STAGGERED_FITMENTS, rankStaggeredSizes } from "@/lib/staggered-fitments";
import { JsonLd } from "@/components/json-ld";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Staggered Tire Size Calculator — Front/Rear Fitment Checker & Guide",
  description:
    "Check a staggered (different front/rear) tire setup: diameter match, width split, AWD warnings — plus common factory staggered fitments for popular performance cars.",
  alternates: { canonical: "/tools/staggered-tire-calculator" },
};

const FAQ = [
  {
    q: "What is a staggered tire setup?",
    a: "Different sizes front and rear — typically wider tires on the drive (rear) axle for traction, like 255/40R19 front and 275/40R19 rear on a Mustang GT. The rear usually ends up slightly taller as well as wider.",
  },
  {
    q: "Can I run staggered tires on an AWD car?",
    a: "Only if it came from the factory that way. AWD drivelines expect all four tires to roll the same distance — mismatched diameters cause driveline wind-up and can damage the center differential.",
  },
  {
    q: "Can staggered tires be rotated?",
    a: "Not front-to-rear — the sizes don't match. Directional tires can't even swap side-to-side. Expect the drive-axle pair to wear first and replace in axle pairs.",
  },
  {
    q: "How close do front and rear diameters need to be?",
    a: "Most factory staggered setups land within about ±3% overall diameter difference (Mustang GT +2.3%, Camaro SS −0.5%), though extreme rear-drive cars go further. The safe play is matching your own car's factory fitment — speedometer and stability control are calibrated around it.",
  },
];

export default function StaggeredCalculatorPage() {
  const ranked = rankStaggeredSizes().filter((r) => r.count >= 2);
  return (
    <div className="pt-8">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
        <Link href="/">Home</Link> / <Link href="/tools">Tools</Link> / Staggered Calculator
      </nav>
      <h1 className="mt-2 text-2xl font-black">Staggered Tire Size Calculator</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        Wider in the back? Check that your front/rear combination actually works — then find your car in the factory
        fitment guide below.
      </p>

      <div className="mt-6">
        <StaggeredCalculator />
      </div>

      {/* factory fitment reference */}
      <section className="mt-10">
        <h2 className="text-lg font-bold">Common factory staggered fitments</h2>
        <p className="mt-1 max-w-2xl text-sm text-steel-500">
          Popular US-market vehicles that ship staggered from the factory. Year ranges are approximate and trims vary —
          always confirm against the door placard.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full max-w-3xl border-collapse text-sm">
            <thead>
              <tr>
                <th className="border border-slate-300 bg-slate-50 px-3 py-2 text-left font-bold">Vehicle</th>
                <th className="border border-slate-300 bg-slate-50 px-3 py-2 text-left font-bold">Front</th>
                <th className="border border-slate-300 bg-slate-50 px-3 py-2 text-left font-bold">Rear</th>
              </tr>
            </thead>
            <tbody>
              {STAGGERED_FITMENTS.map((f) => (
                <tr key={f.vehicle} className="hover:bg-slate-50">
                  <td className="border border-slate-300 px-3 py-2">
                    <span className="font-semibold text-navy-900">{f.vehicle}</span>{" "}
                    <span className="text-xs text-steel-400">{f.years}</span>
                  </td>
                  <td className="border border-slate-300 px-3 py-2">
                    <Link href={`/tires?q=${encodeURIComponent(f.front)}`} className="font-mono text-xs font-bold text-brand-dark hover:underline">{f.front}</Link>
                  </td>
                  <td className="border border-slate-300 px-3 py-2">
                    <Link href={`/tires?q=${encodeURIComponent(f.rear)}`} className="font-mono text-xs font-bold text-brand-dark hover:underline">{f.rear}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* sizes that recur across fitments — the stocking signal */}
      <section className="mt-10">
        <h2 className="text-lg font-bold">The sizes that keep showing up</h2>
        <p className="mt-1 max-w-2xl text-sm text-steel-500">
          Counted straight from the fitment table above — sizes serving multiple popular staggered vehicles are the
          ones performance shops reach for most.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {ranked.map((r) => (
            <Link key={r.size} href={`/tires?q=${encodeURIComponent(r.size)}`}
              className="rounded-xl border border-steel-200 bg-white px-3 py-2 shadow-card transition hover:border-brand hover:shadow-lift">
              <span className="font-mono text-sm font-bold text-navy-900">{r.size}</span>
              <span className="ml-2 text-xs text-steel-500">{r.count} fitments · {r.axle}</span>
            </Link>
          ))}
        </div>
      </section>

      <div className="mt-10 rounded-2xl bg-navy-900 p-7 text-white shadow-card">
        <h2 className="h-display text-2xl">Stocking UHP sizes? Talk staggered programs.</h2>
        <p className="mt-2 max-w-2xl text-sm text-steel-300">
          Ultra-high-performance lines in the front/rear sizes above — by the set, pallet or container, at dealer
          pricing.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/tires/passenger" className="btn-gold">Browse Passenger &amp; UHP Tires</Link>
          <Link href="/quote" className="btn-ghost-dark">Request a Quote</Link>
        </div>
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
          url: `${SITE.url}/tools/staggered-tire-calculator`,
        }}
      />
    </div>
  );
}
