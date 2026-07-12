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

/**
 * Parse metric ("225/45R17", "ST235/80R16") and flotation ("33X12.50R20",
 * "37/13.50R24", "35x12.5r17") sizes — case/space tolerant.
 */
export function parseTireSize(s: string): TireSpec | null {
  const v = s.trim().toUpperCase().replace(/\s+/g, "");

  // flotation: 31–54 X 9.5–18.5 R 15–26 (accepts X or /)
  const f = v.match(/^(\d{2}(?:\.\d)?)[X/](\d{1,2}(?:\.\d{1,2})?)(?:R|D|B)(\d{2}(?:\.\d)?)$/);
  if (f) {
    const diameterIn = Number(f[1]);
    const widthIn = Number(f[2]);
    const rim = Number(f[3]);
    if (diameterIn >= 25 && diameterIn <= 60 && widthIn >= 6 && widthIn <= 24 && rim >= 10 && rim <= 30 && diameterIn > rim) {
      return { kind: "flotation", diameterIn, widthIn, rim };
    }
    return null;
  }

  const m = v.match(/^(?:ST|LT|P)?(\d{3})\/(\d{2,3})(?:R|D|B)(\d{2}(?:\.\d)?)$/);
  if (m) {
    const width = Number(m[1]);
    const aspect = Number(m[2]);
    const rim = Number(m[3]);
    if (width < 100 || width > 445 || aspect < 20 || aspect > 100 || rim < 8 || rim > 30) return null;
    return { kind: "metric", width, aspect, rim };
  }
  return null;
}

export const COMMON_WIDTHS = [145, 155, 165, 175, 185, 195, 205, 215, 225, 235, 245, 255, 265, 275, 285, 295, 305, 315, 325, 335];
export const COMMON_ASPECTS = [25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90];
export const COMMON_RIMS = [12, 13, 14, 15, 16, 16.5, 17, 17.5, 18, 19, 19.5, 20, 22, 22.5, 24];
