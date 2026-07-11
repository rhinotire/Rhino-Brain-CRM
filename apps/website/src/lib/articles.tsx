import type { ReactNode } from "react";

export type Article = {
  slug: string;
  title: string;
  description: string;
  /** GEO rule: 2–3 sentence direct answer to the title question, shown first. */
  answer: string;
  author: string;
  reviewedBy: string;
  updated: string; // ISO date
  body: ReactNode;
};

const th = "border border-slate-300 bg-slate-50 px-3 py-2 text-left text-sm font-bold";
const td = "border border-slate-300 px-3 py-2 text-sm";

/** Knowledge Center scaffold — 2 seed articles (STEP 4). Real expertise only. */
export const ARTICLES: Article[] = [
  {
    slug: "load-range-e-vs-g-vs-h",
    title: "Load Range E vs G vs H for Trailer Tires: Which Do You Need?",
    description:
      "Load range E, G and H trailer tires compared: ply rating, max load and PSI, with a table and buying guidance from a wholesale distributor.",
    answer:
      "Load range E trailer tires carry roughly 2,830–3,750 lbs per tire at 80 PSI and suit most utility and boat trailers. Load range G (14-ply, ~4,400 lbs at 110 PSI) and H (16-ply, ~4,805+ lbs at 120+ PSI) are for heavy equipment, gooseneck and commercial trailers where E-rated tires run at their limit.",
    author: "Rhino Tire USA Wholesale Team",
    reviewedBy: "William Yi, Owner",
    updated: "2026-07-11",
    body: (
      <>
        <h2>Quick comparison</h2>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>Load Range</th>
                <th className={th}>Ply Rating</th>
                <th className={th}>Typical Max Load (single)</th>
                <th className={th}>Max PSI</th>
                <th className={th}>Common Use</th>
              </tr>
            </thead>
            <tbody>
              <tr><td className={td}>E</td><td className={td}>10</td><td className={td}>2,830–3,750 lbs</td><td className={td}>80</td><td className={td}>Utility, boat, car haulers</td></tr>
              <tr><td className={td}>G</td><td className={td}>14</td><td className={td}>~4,400 lbs</td><td className={td}>110</td><td className={td}>Gooseneck, equipment trailers</td></tr>
              <tr><td className={td}>H</td><td className={td}>16</td><td className={td}>4,805+ lbs</td><td className={td}>120+</td><td className={td}>Heavy commercial trailers</td></tr>
            </tbody>
          </table>
        </div>
        <h2>How to choose</h2>
        <p>
          Add up your loaded trailer weight (trailer + cargo), divide by the number of tires, then add a 20% safety
          margin. If the result is within 85% of an E-rated tire&apos;s max load, step up to G. Based on our Orlando
          warehouse shipping data, ST235/80R16 load range E is the most replaced trailer size in Florida — most
          failures we see come from running E-rated tires at their ceiling in summer heat.
        </p>
        <h2>Popular sizes we stock</h2>
        <p>
          ST205/75R15 (E), ST225/75R15 (E), ST235/80R16 (E and G). Wholesale buyers can request pallet pricing on any
          of these through the quote form.
        </p>
      </>
    ),
  },
  {
    slug: "st-tire-selection-guide",
    title: "ST Tire Selection Guide: Matching Trailer Tires to Trailer Type",
    description:
      "How to pick the right ST trailer tire by trailer type — size, load range and construction, from a Florida wholesale distributor.",
    answer:
      "Match the ST tire to the trailer's loaded weight and duty cycle: ST205/75R15 load range D–E covers most single-axle utility trailers, ST225/75R15 E fits tandem utility and boat trailers, and ST235/80R16 E–G is the standard for gooseneck, equipment and cargo trailers. Always use ST-rated tires — passenger tires are not built for trailer sidewall loads.",
    author: "Rhino Tire USA Wholesale Team",
    reviewedBy: "William Yi, Owner",
    updated: "2026-07-11",
    body: (
      <>
        <h2>By trailer type</h2>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full border-collapse">
            <thead>
              <tr>
                <th className={th}>Trailer Type</th>
                <th className={th}>Typical Size</th>
                <th className={th}>Load Range</th>
              </tr>
            </thead>
            <tbody>
              <tr><td className={td}>Single-axle utility</td><td className={td}>ST205/75R15</td><td className={td}>D–E</td></tr>
              <tr><td className={td}>Tandem utility / boat</td><td className={td}>ST225/75R15</td><td className={td}>E</td></tr>
              <tr><td className={td}>Gooseneck / equipment</td><td className={td}>ST235/80R16</td><td className={td}>E–G</td></tr>
              <tr><td className={td}>Heavy commercial</td><td className={td}>ST235/85R16 or 17.5&quot;</td><td className={td}>G–H</td></tr>
            </tbody>
          </table>
        </div>
        <h2>Radial vs bias</h2>
        <p>
          Radial (R) ST tires run cooler and wear better on highway miles; bias (D) tires have stiffer sidewalls for
          rough-yard duty. For Florida highway hauling we recommend radial in nearly every case — heat is the
          number-one killer of trailer tires here.
        </p>
        <h2>Dealer note</h2>
        <p>
          Stocking tip from our distribution data: ST205/75R15 and ST235/80R16 together cover the majority of walk-in
          trailer tire demand. Start there if you are adding trailer tires to your shop.
        </p>
      </>
    ),
  },
];
