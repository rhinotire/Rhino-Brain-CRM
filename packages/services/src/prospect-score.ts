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
Reply ONLY JSON: {"pool","confidence","productLine","score","checks":[...]}.`;

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
  const valid =
    POOLS.includes(o.pool as never) && CONF.includes(o.confidence as never) &&
    LINES.includes(o.productLine as never) && Number.isFinite(o.score as number);
  const checks: SixCheck[] = Array.isArray(o.checks)
    ? (o.checks as SixCheck[]).filter((c) => c && typeof c.check === "string" && typeof c.pass === "boolean" && typeof c.evidence === "string")
    : [];
  const verdict: ProspectVerdict = valid
    ? {
        pool: o.pool as ProspectVerdict["pool"],
        confidence: o.confidence as ProspectVerdict["confidence"],
        productLine: o.productLine as ProspectVerdict["productLine"],
        score: Math.max(0, Math.min(100, Math.round(o.score as number))),
        checks,
      }
    : { pool: "C_CHANNEL", confidence: "L", productLine: "P4_TBR", score: 0, checks };
  return { verdict, inputTokens, outputTokens };
}
