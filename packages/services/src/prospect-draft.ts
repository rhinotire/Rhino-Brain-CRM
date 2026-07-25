import { askClaudeJson } from "./claude-json";
import type { Enrichment } from "./prospect-enrich";

/**
 * Personalized first-touch outreach draft for a prospect: cold email + phone
 * opener, grounded in what the enrichment actually found on their website.
 * Compliance hard lines (spec §8): never promise tariff/duty rates, never
 * invent certifications or inventory we didn't state.
 */
export type OutreachDraft = {
  emailSubject: string;
  emailBody: string;
  phoneOpener: string;
  talkingPoints: string[];
  generatedAt: string;
};

const DRAFT_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

const SYSTEM = `You write first-touch B2B outreach for a US wholesale tire supplier.
Sender identity: use the company given in the user message (Rhino Tire USA, Orlando FL warehouse — or Everflow Tire, Dallas TX warehouse). Products: TBR truck tires (top priority), PCR passenger tires, ST trailer tires & wheels. Chinese factory supply chain + US local stock, wholesale only.
Write like a helpful wholesale rep, never corporate or pushy. Ground every claim in the prospect facts provided — reference what THEY sell or do. If enrichment is thin, keep it generic-but-honest; never invent facts about them or us.
HARD RULES: never mention or promise tariff/duty rates; never claim certifications, awards, or specific inventory numbers; email body <= 130 words, plain text, no links except a plain "reply to this email"; sign off with "[Rep Name]" placeholder; one clear CTA (quick call this week OR reply for the wholesale price list).
Reply ONLY JSON: {"emailSubject": string (<=8 words, no clickbait), "emailBody": string, "phoneOpener": string (<=60 words, natural spoken English), "talkingPoints": string[] (exactly 3, each <=15 words, angle: what they sell -> what we offer)}.`;

export async function generateOutreachDraft(
  input: {
    companyName: string;
    city: string | null;
    state: string | null;
    productLine: string | null;
    enrichment: Enrichment | null;
    angle: string | null;
    senderCompany: "Rhino Tire USA (Orlando, FL)" | "Everflow Tire (Dallas, TX)";
    contact?: { name: string; title: string } | null;
  },
  ask: typeof askClaudeJson = askClaudeJson
): Promise<{ draft: OutreachDraft; inputTokens: number; outputTokens: number }> {
  const { json, inputTokens, outputTokens } = await ask({
    system: SYSTEM,
    user: [
      `Sender company: ${input.senderCompany}`,
      `Prospect: ${input.companyName} (${[input.city, input.state].filter(Boolean).join(", ") || "US"})`,
      input.contact ? `Address the email to: ${input.contact.name}, ${input.contact.title} (greet them by first name)` : "No named contact — open with a role-neutral greeting.",
      `Best-fit product line: ${input.productLine ?? "unknown"}`,
      input.angle ? `Sales angle from market analysis: ${input.angle}` : "",
      `Website enrichment:\n${JSON.stringify(input.enrichment ?? {}, null, 1)}`,
    ].filter(Boolean).join("\n"),
    maxTokens: 1000,
    model: DRAFT_MODEL,
  });
  const o = (json ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  const draft: OutreachDraft = {
    emailSubject: str(o.emailSubject),
    emailBody: str(o.emailBody),
    phoneOpener: str(o.phoneOpener),
    talkingPoints: Array.isArray(o.talkingPoints) ? o.talkingPoints.filter((t): t is string => typeof t === "string").slice(0, 3) : [],
    generatedAt: new Date().toISOString(),
  };
  if (!draft.emailBody || !draft.emailSubject) throw new Error("draft generation returned an incomplete reply — try again");
  return { draft, inputTokens, outputTokens };
}
