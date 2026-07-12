/** Standard tire-size math (metric sizing: e.g. 225/45R17, ST235/80R16). */

export type TireSpec = { width: number; aspect: number; rim: number };

export type TireCalc = {
  sidewallIn: number;
  diameterIn: number;
  widthIn: number;
  circumferenceIn: number;
  revsPerMile: number;
  diameterMm: number;
};

export function calcTire(t: TireSpec): TireCalc {
  const sidewallMm = (t.width * t.aspect) / 100;
  const diameterMm = t.rim * 25.4 + 2 * sidewallMm;
  const diameterIn = diameterMm / 25.4;
  const circumferenceIn = Math.PI * diameterIn;
  return {
    sidewallIn: sidewallMm / 25.4,
    diameterIn,
    widthIn: t.width / 25.4,
    circumferenceIn,
    revsPerMile: 63360 / circumferenceIn,
    diameterMm,
  };
}

/** % difference of tire B vs tire A (positive = B is larger). */
export function diameterDiffPct(a: TireCalc, b: TireCalc): number {
  return ((b.diameterIn - a.diameterIn) / a.diameterIn) * 100;
}

/** True speed when the speedometer (calibrated for tire A) reads `indicated` on tire B. */
export function actualSpeed(indicated: number, a: TireCalc, b: TireCalc): number {
  return indicated * (b.diameterIn / a.diameterIn);
}

/** Parse "225/45R17", "ST235/80R16", "LT265/70R17" (case/space tolerant). */
export function parseTireSize(s: string): TireSpec | null {
  const m = s.trim().toUpperCase().replace(/\s+/g, "").match(/^(?:ST|LT|P)?(\d{3})\/(\d{2,3})(?:R|D|B)(\d{2}(?:\.\d)?)$/);
  if (!m) return null;
  const width = Number(m[1]);
  const aspect = Number(m[2]);
  const rim = Number(m[3]);
  if (width < 100 || width > 445 || aspect < 20 || aspect > 100 || rim < 8 || rim > 30) return null;
  return { width, aspect, rim };
}

export const COMMON_WIDTHS = [145, 155, 165, 175, 185, 195, 205, 215, 225, 235, 245, 255, 265, 275, 285, 295, 305, 315, 325, 335];
export const COMMON_ASPECTS = [25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90];
export const COMMON_RIMS = [12, 13, 14, 15, 16, 16.5, 17, 17.5, 18, 19, 19.5, 20, 22, 22.5, 24];
