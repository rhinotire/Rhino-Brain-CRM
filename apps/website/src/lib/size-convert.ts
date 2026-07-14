import { calcTire, type TireSpec, type TireCalc } from "@/lib/tire-math";

/**
 * Metric ↔ inch (flotation) equivalents: generate standard sizes on the same
 * rim and rank by how close the overall diameter (then width) comes. Pure
 * geometry over the standard size grids — no invented fitment claims.
 */

export type Equivalent = { spec: TireSpec; calc: TireCalc; dDiffPct: number; wDiffIn: number };

/** Standard metric grids. */
const METRIC_WIDTHS = Array.from({ length: 30 }, (_, i) => 145 + i * 10); // 145–435, xx5 series
const METRIC_ASPECTS = Array.from({ length: 13 }, (_, i) => 25 + i * 5); // 25–85

/** Common flotation grids — whole-inch diameters are what the market stocks. */
const FLOT_DIAMETERS = Array.from({ length: 15 }, (_, i) => 26 + i); // 26–40
const FLOT_WIDTHS = [8.5, 9.5, 10.5, 11.5, 12.5, 13.5, 14.5, 15.5];

export function findEquivalents(input: TireSpec, take = 4): Equivalent[] {
  const target = calcTire(input);
  const candidates: TireSpec[] =
    input.kind === "flotation"
      ? METRIC_WIDTHS.flatMap((width) =>
          METRIC_ASPECTS.map((aspect): TireSpec => ({ kind: "metric", width, aspect, rim: input.rim })))
      : FLOT_DIAMETERS.flatMap((diameterIn) =>
          FLOT_WIDTHS.map((widthIn): TireSpec => ({ kind: "flotation", diameterIn, widthIn, rim: input.rim })));

  return candidates
    .map((spec) => {
      const calc = calcTire(spec);
      return {
        spec,
        calc,
        dDiffPct: ((calc.diameterIn - target.diameterIn) / target.diameterIn) * 100,
        wDiffIn: calc.widthIn - target.widthIn,
      };
    })
    .filter((e) => Math.abs(e.dDiffPct) <= 5)
    // diameter is king, but a real-world "equivalent" also keeps the width
    // close (industry crossover for 33X12.50R20 is 305/55R20, not 275/60R20)
    .sort((a, b) => score(a) - score(b))
    .slice(0, take);
}

function score(e: Equivalent): number {
  return Math.abs(e.dDiffPct) + Math.abs(e.wDiffIn) * 1.2;
}
