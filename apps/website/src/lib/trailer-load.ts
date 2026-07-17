/**
 * Trailer tire load math. Everything here is deterministic industry math:
 * weight distribution + the standard ETRTO/TRA load-index table. We
 * deliberately do NOT publish per-size capacity claims — the calculator
 * always points the user at the max-load stamp on the sidewall.
 */

/** Standard load-index → kg table (ETRTO), LI 60–150. */
const LI_KG: Record<number, number> = {
  60: 250, 61: 257, 62: 265, 63: 272, 64: 280, 65: 290, 66: 300, 67: 307, 68: 315, 69: 325,
  70: 335, 71: 345, 72: 355, 73: 365, 74: 375, 75: 387, 76: 400, 77: 412, 78: 425, 79: 437,
  80: 450, 81: 462, 82: 475, 83: 487, 84: 500, 85: 515, 86: 530, 87: 545, 88: 560, 89: 580,
  90: 600, 91: 615, 92: 630, 93: 650, 94: 670, 95: 690, 96: 710, 97: 730, 98: 750, 99: 775,
  100: 800, 101: 825, 102: 850, 103: 875, 104: 900, 105: 925, 106: 950, 107: 975, 108: 1000, 109: 1030,
  110: 1060, 111: 1090, 112: 1120, 113: 1150, 114: 1180, 115: 1215, 116: 1250, 117: 1285, 118: 1320, 119: 1360,
  120: 1400, 121: 1450, 122: 1500, 123: 1550, 124: 1600, 125: 1650, 126: 1700, 127: 1750, 128: 1800, 129: 1850,
  130: 1900, 131: 1950, 132: 2000, 133: 2060, 134: 2120, 135: 2180, 136: 2240, 137: 2300, 138: 2360, 139: 2430,
  140: 2500, 141: 2575, 142: 2650, 143: 2725, 144: 2800, 145: 2900, 146: 3000, 147: 3075, 148: 3150, 149: 3250,
  150: 3350,
};

const KG_TO_LBS = 2.20462;

export const loadIndexLbs = (li: number): number | null =>
  LI_KG[li] ? Math.round(LI_KG[li] * KG_TO_LBS) : null;

export const LOAD_INDEX_TABLE: { li: number; lbs: number }[] = Object.entries(LI_KG).map(([li, kg]) => ({
  li: Number(li),
  lbs: Math.round(kg * KG_TO_LBS),
}));

export type HitchType = "bumper" | "gooseneck" | "full";

/** Share of the trailer's weight carried by the tow vehicle's hitch. */
export const HITCH_SHARE: Record<HitchType, { label: string; share: number; note: string }> = {
  bumper: { label: "Bumper pull", share: 0.10, note: "~10–15% of the weight rides on the hitch" },
  gooseneck: { label: "Gooseneck / 5th wheel", share: 0.20, note: "~20–25% of the weight rides on the pin" },
  full: { label: "Full load on axles", share: 0, note: "dollies, jockey-wheel or worst-case check" },
};

export type TrailerLoadResult = {
  loadOnTires: number; // lbs carried by the trailer's axles
  tires: number;
  perTireMin: number; // bare minimum capacity per tire
  perTireRecommended: number; // with the industry reserve margin
  reservePct: number;
  loadIndexNeeded: number | null; // smallest standard LI covering the recommendation
  loadIndexLbs: number | null;
};

/** 20% reserve is the widely-taught margin for trailer tires — heat is the killer. */
export const RESERVE = 0.2;

export function calcTrailerLoad(gvwrLbs: number, axles: number, hitch: HitchType): TrailerLoadResult | null {
  if (!Number.isFinite(gvwrLbs) || gvwrLbs < 500 || gvwrLbs > 60000) return null;
  if (![1, 2, 3].includes(axles)) return null;
  const tires = axles * 2;
  const loadOnTires = Math.round(gvwrLbs * (1 - HITCH_SHARE[hitch].share));
  const perTireMin = Math.ceil(loadOnTires / tires);
  const perTireRecommended = Math.ceil(perTireMin * (1 + RESERVE));
  const hit = LOAD_INDEX_TABLE.find((r) => r.lbs >= perTireRecommended) ?? null;
  return {
    loadOnTires,
    tires,
    perTireMin,
    perTireRecommended,
    reservePct: RESERVE * 100,
    loadIndexNeeded: hit?.li ?? null,
    loadIndexLbs: hit?.lbs ?? null,
  };
}
