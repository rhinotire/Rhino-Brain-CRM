import { askClaudeJson } from "./claude-json";
import type { Enrichment } from "./prospect-enrich";

// ---- Owner-reviewable business rule (spec §4.3): which states belong to
// which warehouse. Everything else stays unassigned for manual routing. ----
export const RHINO_STATES = ["FL", "GA", "AL", "SC", "NC", "TN", "MS"];
export const EVERFLOW_STATES = ["TX", "OK", "LA", "AR", "NM"];

export function assignStateLocation(state: string | null): "RHINO" | "EVERFLOW" | null {
  if (!state) return null;
  const s = state.toUpperCase();
  if (RHINO_STATES.includes(s)) return "RHINO";
  if (EVERFLOW_STATES.includes(s)) return "EVERFLOW";
  return null;
}

export type SixCheck = { check: string; pass: boolean; evidence: string };
export type ProspectVerdict = {
  pool: "A_BUYER" | "B_PROJECT" | "C_CHANNEL" | "D_EXCLUDED";
  confidence: "H" | "M" | "L";
  productLine: "P1_TRAILER_TIRE" | "P2_TRAILER_WHEEL" | "P3_PCR" | "P4_TBR" | "P5_OTR";
  score: number;
  checks: SixCheck[];
};

const POOLS = ["A_BUYER", "B_PROJECT", "C_CHANNEL", "D_EXCLUDED"] as const;
const CONF = ["H", "M", "L"] as const;
const LINES = ["P1_TRAILER_TIRE", "P2_TRAILER_WHEEL", "P3_PCR", "P4_TBR", "P5_OTR"] as const;

const SYSTEM = `You grade B2B prospects for a Chinese-owned US wholesale tire supplier (warehouses: Orlando FL, Dallas TX; products: TBR truck tires [top priority], PCR passenger tires, ST trailer tires, trailer wheels, OTR).
Run six checks, each {check, pass, evidence}:
1 real entity (website/locations/team) 2 real business (sells/uses tires, wheels, trailer or commercial-vehicle parts) 3 product match (which of our lines fits) 4 purchasing logic (import/wholesale/central purchasing/OEM fitment/fleet replacement) 5 contact locatable (purchasing/category/fleet roles findable) 6 risk clear (not a single install-only shop, not used-tire only).
Then output pool: A_BUYER = direct buyer (distributors, truck shops, fleets, transportation companies with bulk-buy logic); B_PROJECT = OEM/big retail needing vendor approval; C_CHANNEL = relevant but purchasing power unproven; D_EXCLUDED = irrelevant/invalid.
confidence: H all six checks solid; M some unverified; L thin evidence.
productLine: the single best-fit line. score: 0-100 (weight: purchasing logic 30, product match 25, real business 20, contact 15, entity 10).
Reply ONLY JSON: {"pool","confidence","productLine","score","checks":[...]}.
Field values MUST be these exact literals — pool: "A_BUYER"|"B_PROJECT"|"C_CHANNEL"|"D_EXCLUDED"; confidence: "H"|"M"|"L"; productLine: "P1_TRAILER_TIRE"|"P2_TRAILER_WHEEL"|"P3_PCR"|"P4_TBR"|"P5_OTR". Never abbreviate (not "TBR", not "A").`;

// Real-run finding 2026-07-25: models return "TBR"/"PCR"-style shorthand for
// productLine despite the prompt. Normalize before validating.
const LINE_ALIASES: Record<string, ProspectVerdict["productLine"]> = {
  P1: "P1_TRAILER_TIRE", ST: "P1_TRAILER_TIRE", TRAILER: "P1_TRAILER_TIRE", TRAILER_TIRE: "P1_TRAILER_TIRE", TRAILER_TIRES: "P1_TRAILER_TIRE",
  P2: "P2_TRAILER_WHEEL", WHEEL: "P2_TRAILER_WHEEL", WHEELS: "P2_TRAILER_WHEEL", TRAILER_WHEEL: "P2_TRAILER_WHEEL", TRAILER_WHEELS: "P2_TRAILER_WHEEL",
  P3: "P3_PCR", PCR: "P3_PCR", PASSENGER: "P3_PCR",
  P4: "P4_TBR", TBR: "P4_TBR", TRUCK: "P4_TBR", COMMERCIAL: "P4_TBR",
  P5: "P5_OTR", OTR: "P5_OTR", AG: "P5_OTR", AGRICULTURAL: "P5_OTR",
};

function normalizeLine(v: unknown): ProspectVerdict["productLine"] | null {
  if (typeof v !== "string") return null;
  const s = v.toUpperCase().trim().replace(/[\s-]+/g, "_");
  if ((LINES as readonly string[]).includes(s)) return s as ProspectVerdict["productLine"];
  return LINE_ALIASES[s] ?? null;
}

export async function scoreProspect(
  input: { companyName: string; state: string | null; enrichment: Enrichment },
  ask: typeof askClaudeJson = askClaudeJson
): Promise<{ verdict: ProspectVerdict; inputTokens: number; outputTokens: number }> {
  const { json, inputTokens, outputTokens } = await ask({
    system: SYSTEM,
    user: `Company: ${input.companyName} (state: ${input.state ?? "unknown"})\nEnrichment:\n${JSON.stringify(input.enrichment, null, 1)}`,
    maxTokens: 1200,
  });
  const o = (json ?? {}) as Record<string, unknown>;
  const checks: SixCheck[] = Array.isArray(o.checks)
    ? (o.checks as SixCheck[]).filter((c) => c && typeof c.check === "string" && typeof c.pass === "boolean" && typeof c.evidence === "string")
    : [];
  // Field-level validation: one malformed field must not throw away the rest
  // of an otherwise-sound verdict (real-run finding 2026-07-25).
  const verdict: ProspectVerdict = {
    pool: POOLS.includes(o.pool as never) ? (o.pool as ProspectVerdict["pool"]) : "C_CHANNEL",
    confidence: CONF.includes(o.confidence as never) ? (o.confidence as ProspectVerdict["confidence"]) : "L",
    productLine: normalizeLine(o.productLine) ?? "P4_TBR",
    score: Number.isFinite(o.score as number) ? Math.max(0, Math.min(100, Math.round(o.score as number))) : 0,
    checks,
  };
  return { verdict, inputTokens, outputTokens };
}
