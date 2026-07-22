import type { Metadata } from "next";
import Link from "next/link";
import { FleetForm } from "@/components/lead-forms";
import { getBrand } from "@/lib/brand";
import { COPY } from "@/lib/brand-copy";

/**
 * Fleet Solutions landing (master instruction §6.8): commercial-fleet lead
 * capture. The form feeds the existing quote→Lead pipeline.
 */
export const metadata: Metadata = {
  title: "Fleet Tire Solutions — Standardized Supply for Commercial Fleets",
  description: `Fleet tire sourcing from ${COPY.name}: steer, drive and trailer positions, size consolidation, delivery coordination, and one point of contact for replacement planning.`,
  alternates: { canonical: "/fleet-solutions" },
};

const BENEFITS = [
  ["One supplier, every position", "Steer, drive, trailer and all-position tires plus ST trailer sizes — consolidate your buying instead of chasing three vendors."],
  ["Size consolidation", "We help standardize sizes across the fleet so you carry fewer spares and buy in better volume."],
  ["Replacement planning", "Tell us your monthly burn and we keep your sizes stocked — no scrambling when a unit goes down."],
  ["Live availability", "Every published SKU shows live stock status; your rep confirms quantities on the quote."],
  ["Delivery coordination", "Warehouse pickup or delivery — confirmed per order by ZIP and volume."],
  ["Emergency sourcing", "Down unit and we don't stock the size? We source it through our supplier network."],
] as const;

export default async function FleetSolutionsPage() {
  const brand = await getBrand();
  return (
    <div className="pt-8">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
        <Link href="/">Home</Link> / Fleet Solutions
      </nav>
      <h1 className="mt-2 text-2xl font-black">Fleet Tire Solutions</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
        Trucking, construction, landscaping, delivery — if you run vehicles, tires are a line item that deserves a plan.{" "}
        {COPY.name} supplies fleets at dealer tier pricing. {COPY.deliveryStat}.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {BENEFITS.map(([title, body]) => (
          <div key={title} className="rounded-2xl border border-steel-200 bg-white p-5 shadow-card">
            <h2 className="font-black text-navy-900">{title}</h2>
            <p className="mt-1.5 text-sm text-slate-700">{body}</p>
          </div>
        ))}
      </div>

      <div className="mt-10 rounded-2xl bg-navy-900 p-6 text-white">
        <h2 className="h-display text-2xl">Tell us about your fleet</h2>
        <p className="mt-1 text-sm text-steel-300">
          A rep replies within one business day with a program quote. Prefer the phone?{" "}
          <a href={`tel:${brand.phone}`} className="font-bold text-brand-light">{brand.phoneDisplay}</a>
        </p>
      </div>
      <FleetForm />

      <p className="mt-8 text-sm text-slate-600">
        Also see: <Link href="/tires/commercial-truck" className="font-bold text-brand-dark">commercial truck tires</Link> ·{" "}
        <Link href="/tools/cost-per-mile-calculator" className="font-bold text-brand-dark">cost-per-mile calculator</Link> ·{" "}
        <Link href="/become-a-dealer" className="font-bold text-brand-dark">dealer program</Link>
      </p>
    </div>
  );
}
