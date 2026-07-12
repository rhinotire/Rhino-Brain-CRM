/**
 * Tire-size math. Two sizing systems:
 *  - metric:    225/45R17, ST235/80R16, LT265/70R17  (width mm / aspect % R rim)
 *  - flotation: 33X12.50R20, 37X13.50R24             (diameter in X width in R rim)
 */

export type TireSpec =
  | { kind: "metric"; width: number; aspect: number; rim: number }
  | { kind: "flotation"; diameterIn: number; widthIn: number; rim: number };

export type TireCalc = {
  sidewallIn: number;
  diameterIn: number;
  widthIn: number;
  circumferenceIn: number;
  revsPerMile: number;
  diameterMm: number;
  rim: number;
};

export function calcTire(t: TireSpec): TireCalc {
  let diameterIn: number, widthIn: number;
  if (t.kind === "metric") {
    const sidewallMm = (t.width * t.aspect) / 100;
    diameterIn = (t.rim * 25.4 + 2 * sidewallMm) / 25.4;
    widthIn = t.width / 25.4;
  } else {
    diameterIn = t.diameterIn;
    widthIn = t.widthIn;
  }
  const circumferenceIn = Math.PI * diameterIn;
  return {
    sidewallIn: (diameterIn - t.rim) / 2,
    diameterIn,
    widthIn,
    circumferenceIn,
    revsPerMile: 63360 / circumferenceIn,
    diameterMm: diameterIn * 25.4,
    rim: t.rim,
  };
}

export function formatTireSize(t: TireSpec): string {
  return t.kind === "metric"
    ? `${t.width}/${t.aspect}R${t.rim}`
    : `${t.diameterIn}X${t.widthIn.toFixed(2).replace(/\.?0+$/, "")}R${t.rim}`;
}

/** % difference of tire B vs tire A (positive = B is larger). */
export function diameterDiffPct(a: TireCalc, b: TireCalc): number {
  return ((b.diameterIn - a.diameterIn) / a.diameterIn) * 100;
}

/** True speed when the speedometer (calibrated for tire A) reads `indicated` on tire B. */
export function actualSpeed(indicated: number, a: TireCalc, b: TireCalc): number {
  return indicated * (b.diameterIn / a.diameterIn);
}

const validMetric = (width: number, aspect: number, rim: number): TireSpec | null =>
  width >= 100 && width <= 445 && aspect >= 20 && aspect <= 100 && rim >= 8 && rim <= 30
    ? { kind: "metric", width, aspect, rim }
    : null;

const validFlotation = (diameterIn: number, widthIn: number, rim: number): TireSpec | null =>
  diameterIn >= 25 && diameterIn <= 60 && widthIn >= 6 && widthIn <= 24 && rim >= 10 && rim <= 30 && diameterIn > rim
    ? { kind: "flotation", diameterIn, widthIn, rim }
    : null;

/**
 * Parse metric ("225/45R17", "ST235/80R16"), flotation ("33X12.50R20",
 * "37/13.50R24") and digits-only shorthand ("2055516" → 205/55R16,
 * "33125020" → 33X12.50R20, "331250" → 33X12.50 + current rim).
 */
export function parseTireSize(s: string, fallbackRim?: number): TireSpec | null {
  const v = s.trim().toUpperCase().replace(/\s+/g, "");

  // digits-only shorthand
  if (/^\d{6,8}$/.test(v)) {
    if (v.length === 7) {
      // WWWAARR: 2055516 → 205/55R16
      return validMetric(+v.slice(0, 3), +v.slice(3, 5), +v.slice(5, 7));
    }
    if (v.length === 8) {
      // metric with half-inch rim: 23580165 → 235/80R16.5
      const metric = validMetric(+v.slice(0, 3), +v.slice(3, 5), +v.slice(5, 8) / 10);
      if (metric) return metric;
      // flotation: 33125020 → 33X12.50R20
      return validFlotation(+v.slice(0, 2), +v.slice(2, 6) / 100, +v.slice(6, 8));
    }
    // 6 digits: 331250 → 33X12.50, rim carried over from the current selection
    if (fallbackRim) return validFlotation(+v.slice(0, 2), +v.slice(2, 6) / 100, fallbackRim);
    return null;
  }

  // flotation: 33X12.50R20 (accepts X or /)
  const f = v.match(/^(\d{2}(?:\.\d)?)[X/](\d{1,2}(?:\.\d{1,2})?)(?:R|D|B)(\d{2}(?:\.\d)?)$/);
  if (f) return validFlotation(Number(f[1]), Number(f[2]), Number(f[3]));

  const m = v.match(/^(?:ST|LT|P)?(\d{3})\/(\d{2,3})(?:R|D|B)(\d{2}(?:\.\d)?)$/);
  if (m) return validMetric(Number(m[1]), Number(m[2]), Number(m[3]));
  return null;
}

export const FLOT_DIAMETERS = [28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 42, 44];
export const FLOT_WIDTHS = [8.5, 9.5, 10.5, 11.5, 12.5, 13.5, 14.5, 15.5, 16.5, 18];
export const FLOT_RIMS = [15, 16, 17, 18, 20, 22, 24, 26];

export const COMMON_WIDTHS = [145, 155, 165, 175, 185, 195, 205, 215, 225, 235, 245, 255, 265, 275, 285, 295, 305, 315, 325, 335];
export const COMMON_ASPECTS = [25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90];
export const COMMON_RIMS = [12, 13, 14, 15, 16, 16.5, 17, 17.5, 18, 19, 19.5, 20, 22, 22.5, 24];
