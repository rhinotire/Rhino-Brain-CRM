import { askClaudeJson } from "./claude-json";

export type Enrichment = {
  emails: string[];
  brandsSold: string[];
  sellsWholesale: boolean | null;
  businessSummary: string;
  buyerSignals: string[];
};

const MAX_CHARS = 8000;

/** Fetch a homepage and reduce it to plain text. "" on any failure (site down ≠ bad lead). */
export async function fetchSiteText(url: string, fetchFn: typeof fetch = fetch): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetchFn(url.includes("://") ? url : `https://${url}`, {
      signal: controller.signal,
      headers: { "user-agent": "Mozilla/5.0 (compatible; RhinoBrain/1.0)" },
    });
    if (!res.ok) return "";
    const html = await res.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z#0-9]+;/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_CHARS);
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

const SYSTEM = `You extract B2B facts from a tire/trailer-industry company website for a wholesale tire supplier's CRM.
Reply with ONLY a JSON object: {"emails": string[], "brandsSold": string[], "sellsWholesale": boolean|null, "businessSummary": string (<=2 sentences, English), "buyerSignals": string[] (evidence of bulk/central purchasing: dealer portals, pallet pricing, multiple locations, fleet programs)}.
Only include facts visible in the text. Unknown -> null / empty array. Never invent emails.`;

export async function extractEnrichment(
  siteText: string,
  companyName: string,
  ask: typeof askClaudeJson = askClaudeJson
): Promise<{ enrichment: Enrichment; inputTokens: number; outputTokens: number }> {
  const { json, inputTokens, outputTokens } = await ask({
    system: SYSTEM,
    user: `Company: ${companyName}\nWebsite text:\n${siteText || "(site unreachable)"}`,
    maxTokens: 800,
  });
  const o = (json ?? {}) as Record<string, unknown>;
  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return {
    enrichment: {
      emails: arr(o.emails),
      brandsSold: arr(o.brandsSold),
      sellsWholesale: typeof o.sellsWholesale === "boolean" ? o.sellsWholesale : null,
      businessSummary: typeof o.businessSummary === "string" ? o.businessSummary : "",
      buyerSignals: arr(o.buyerSignals),
    },
    inputTokens,
    outputTokens,
  };
}
