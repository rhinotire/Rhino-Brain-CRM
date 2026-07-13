import { normalizeSizeInput } from "./size-normalize";

/**
 * Deterministic spec extraction (enrichment pipeline layer 1).
 * Everything here is size math or fixed industry tables — safe to write
 * straight to TireSpec without human review. Fuzzy inference belongs to the
 * AI layer (SpecProposal) instead.
 */

export type RuleSpec = {
  width?: number;
  aspectRatio?: number;
  rimDiameter?: number;
  construction?: string;
  plyRating?: number;
  loadRange?: string;
  loadIndex?: string;
  speedRating?: string;
  position?: string;
  treadType?: string;
  application?: string;
  sectionWidthIn?: number;
  overallDiameterIn?: number;
  mileageWarrantyMiles?: number;
};

/** Industry-standard ply-rating → load-range table. */
const PR_TO_LR: Record<number, string> = { 4: "B", 6: "C", 8: "D", 10: "E", 12: "F", 14: "G", 16: "H", 18: "J", 20: "L" };
const LR_TO_PR: Record<string, number> = { B: 4, C: 6, D: 8, E: 10, F: 12, G: 14, H: 16, J: 18, L: 20 };

/**
 * Supplier sizeSpec strings carry a ply suffix and/or a trailing LT that the
 * size parser doesn't know: "ST205/75R14-8PR", "235/75R17.5-16P",
 * "LT31X10.50R15-6", "30x9.50R15LT-6P", "33X12.50R15LT". Split those off —
 * the ply digits only count if the remainder still parses as a real size.
 */
function splitSizeSuffix(raw: string): { size: string; ply?: number } {
  const v = raw.trim().toUpperCase();
  const m = v.match(/^(.*\d(?:LT|C)?)\s*-\s*(\d{1,2})\s*(?:PR|P)?\s*$/);
  if (m) {
    const rest = m[1].replace(/LT$/, "");
    const ply = Number(m[2]);
    if (ply >= 4 && ply <= 24 && ply % 2 === 0 && normalizeSizeInput(rest)) {
      return { size: rest, ply };
    }
  }
  return { size: v.replace(/(\d)LT$/, "$1") };
}

export function deriveSpecFromProduct(p: {
  sizeSpec?: string | null;
  description?: string | null;
  rawCategory?: string | null;
}): RuleSpec {
  const out: RuleSpec = {};
  const text = `${p.description ?? ""}`;
  const upper = text.toUpperCase();

  // ---- size math ----
  if (p.sizeSpec) {
    const { size, ply } = splitSizeSuffix(p.sizeSpec);
    if (ply) out.plyRating = ply;
    const n = normalizeSizeInput(size);
    if (n?.kind === "metric") {
      out.width = n.width;
      out.aspectRatio = n.aspect;
      out.rimDiameter = n.rim;
      if (/R/i.test(size)) out.construction = "R";
      else if (/\d D \d|\dD\d/i.test(size.replace(/\//g, " "))) out.construction = "D";
      if (n.prefix === "ST") {
        out.application = out.application ?? "trailer";
        out.position = out.position ?? "trailer"; // ST tires are trailer-position by definition
      }
    } else if (n?.kind === "truck") {
      out.rimDiameter = n.rim;
      out.construction = "R";
    } else if (n?.kind === "flotation") {
      out.rimDiameter = n.rim;
      out.sectionWidthIn = n.width;
      out.overallDiameterIn = n.diameter;
      if (/R/i.test(size)) out.construction = "R";
    }
  }

  // ---- fixed-vocabulary text rules ----
  // ply rating: "10-ply", "10 ply", "10PR", "-14PR" (size-suffix ply wins)
  const ply = upper.match(/(\d{1,2})\s*(?:-?\s*PLY|PR)\b/);
  if (ply && !out.plyRating) {
    const n = Number(ply[1]);
    if (n >= 4 && n <= 20 && n % 2 === 0) out.plyRating = n;
  }
  // explicit load range: "Load Range E", "LR-G", "LRE"
  const lr = upper.match(/(?:LOAD\s*RANGE|LR)\s*[-: ]?\s*([B-HJL])\b/);
  if (lr) out.loadRange = lr[1];
  // PR ↔ LR cross-fill
  if (!out.loadRange && out.plyRating && PR_TO_LR[out.plyRating]) out.loadRange = PR_TO_LR[out.plyRating];
  if (!out.plyRating && out.loadRange && LR_TO_PR[out.loadRange]) out.plyRating = LR_TO_PR[out.loadRange];

  // load index + speed rating: "129/125M", "121/118S", "94V" (word boundary)
  const li = upper.match(/\b(\d{2,3}(?:\/\d{2,3})?)([H-NP-Z])\b/);
  if (li && !/^\d+\/\d+R/.test(li[0])) {
    out.loadIndex = li[1];
    out.speedRating = li[2];
  }

  // axle position (commercial)
  if (/\bDRIVE\b/.test(upper)) out.position = "drive";
  else if (/\bSTEER\b/.test(upper)) out.position = "steer";
  else if (/\bALL[- ]?POSITION\b|\bA\/P\b/.test(upper)) out.position = "all-position";
  else if (/\bTRAILER\s*POSITION\b/.test(upper)) out.position = "trailer";

  // tread type
  if (/\bM\/T\b|MUD[- ]?TERRAIN/.test(upper)) out.treadType = "mud-terrain";
  else if (/\bR\/T\b|RUGGED[- ]?TERRAIN/.test(upper)) out.treadType = "rugged-terrain";
  else if (/\bA\/T\b|ALL[- ]?TERRAIN/.test(upper)) out.treadType = "all-terrain";
  else if (/\bH\/T\b|HIGHWAY[- ]?TERRAIN|\bHIGHWAY\b/.test(upper)) out.treadType = "highway";
  else if (/TOURING/.test(upper)) out.treadType = "touring";
  else if (/\bUHP\b|ULTRA[- ]HIGH[- ]PERFORMANCE/.test(upper)) out.treadType = "ultra-high-performance";
  else if (/HIGH[- ]PERFORMANCE/.test(upper)) out.treadType = "high-performance";
  else if (/ALL[- ]?SEASON/.test(upper)) out.treadType = "all-season";
  else if (/\bRIB\b/.test(upper)) out.treadType = "rib";

  // construction words beat size-string guess
  if (/\bRADIAL\b/.test(upper)) out.construction = "R";
  else if (/\bBIAS\b/.test(upper)) out.construction = "D";

  // mileage warranty: "50,000 Mile", "45000 MILE"
  const mi = upper.match(/\b(\d{2,3})[,.]?000\s*-?\s*MILE/);
  if (mi) out.mileageWarrantyMiles = Number(mi[1]) * 1000;

  // ZR sizes (205/45ZR16) are Z speed-rated by definition; a service
  // description letter (91W etc.) from the text rules above is more specific.
  if (!out.speedRating && /\d{2}ZR\d/.test((p.sizeSpec ?? "").toUpperCase())) out.speedRating = "Z";

  // application from the import's raw category label
  const rawCat = (p.rawCategory ?? "").toLowerCase();
  if (!out.application) {
    if (rawCat.includes("trailer")) out.application = "trailer";
    else if (rawCat.includes("atv") || rawCat.includes("utv")) out.application = "atv-utv";
    else if (rawCat.includes("golf")) out.application = "golf-cart";
    else if (rawCat.includes("lawn") || rawCat.includes("garden")) out.application = "lawn-garden";
    else if (rawCat.includes("industrial") || rawCat.includes("forklift")) out.application = "industrial";
    else if (rawCat.includes("agricultur") || rawCat.includes("farm")) out.application = "agricultural";
  }

  return out;
}

/** Fields the rules engine could not settle for a product — the AI layer's worklist. */
export function specGaps(existing: Record<string, unknown>, ruled: RuleSpec): string[] {
  const CORE = ["loadRange", "plyRating", "position", "treadType", "construction", "loadIndex", "speedRating", "application"];
  return CORE.filter((f) => {
    const cur = existing[f] ?? (ruled as Record<string, unknown>)[f];
    return cur === null || cur === undefined || cur === "";
  });
}
