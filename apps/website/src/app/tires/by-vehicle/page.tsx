import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Find Tires for Your Vehicle — Locate Your Tire Size",
  description:
    "Find the right tire size for your car, truck or trailer in under a minute: check the driver's door jamb or the tire sidewall, then search our live wholesale stock.",
  alternates: { canonical: "/tires/by-vehicle" },
};

const STEPS = [
  {
    title: "Check the driver's door jamb",
    body: "Open the driver's door and look for the tire placard on the door frame — it lists the factory tire size (e.g. 225/65R17) and recommended pressures. This is the size your vehicle was designed for.",
  },
  {
    title: "Or read the tire sidewall",
    body: "The size is molded into every tire's sidewall: a code like 225/65R17, LT265/70R17, or ST205/75R15 for trailers. Trailer owners: always match the ST size and load range on the trailer's VIN plate.",
  },
  {
    title: "Search that size here",
    body: "Type it below in any format — with slashes, spaces, or just the digits. We'll show live wholesale stock from our Orlando and Dallas warehouses.",
  },
];

export default function TiresByVehiclePage() {
  return (
    <div>
      <div className="relative left-1/2 w-screen -translate-x-1/2 bg-navy-900 text-white">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <nav aria-label="Breadcrumb" className="text-xs text-steel-400">
            <Link href="/" className="hover:text-white">Home</Link> / <Link href="/tires" className="hover:text-white">Tires</Link> / By Vehicle
          </nav>
          <h1 className="h-display mt-2 text-4xl">Search by Vehicle</h1>
          <p className="mt-3 max-w-2xl text-sm text-steel-300">
            A year/make/model lookup is coming. Until then, finding your exact size takes under a minute — and size is
            what actually determines fitment.
          </p>
        </div>
      </div>

      <ol className="mt-10 grid gap-5 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="rounded-2xl border-t-4 border-brand bg-white p-6 shadow-card">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-900 font-display text-lg font-bold text-brand">{i + 1}</div>
            <h2 className="mt-3 font-display text-xl font-bold uppercase text-navy-900">{s.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-steel-500">{s.body}</p>
          </li>
        ))}
      </ol>

      <div className="mt-10 rounded-2xl bg-navy-900 p-7 text-white shadow-card">
        <h2 className="h-display text-2xl">Got your size? Search it now</h2>
        <form action="/tires" method="get" className="mt-4 flex max-w-lg gap-2">
          <label htmlFor="bv-q" className="sr-only">Tire size</label>
          <input id="bv-q" name="q" autoComplete="off" placeholder='e.g. "225/65R17" or "2256517"'
            className="w-full rounded-lg border-0 px-4 py-3 text-sm text-navy-900" />
          <button className="btn-gold shrink-0">Search</button>
        </form>
        <p className="mt-3 text-xs text-steel-400">
          Consumers: we&apos;ll route you to professional installation near you. Dealers: wholesale pricing on approval.
        </p>
      </div>
    </div>
  );
}
