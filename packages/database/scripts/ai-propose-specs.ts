/**
 * Spec enrichment — layer 2 (AI proposals).
 * For fields the deterministic rules (enrich-specs.ts) could not settle, ask
 * Claude to read the product text and propose values. Proposals land in
 * SpecProposal as PENDING — nothing reaches the public site until a human
 * approves it in the CRM review queue (layer 3).
 *
 *   pnpm exec tsx scripts/ai-propose-specs.ts --dry          → prompt/coverage stats only
 *   pnpm exec tsx scripts/ai-propose-specs.ts --limit 20     → first 20 products
 *   pnpm exec tsx scripts/ai-propose-specs.ts                → full gap worklist
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { deriveSpecFromProduct, specGaps, validateSpecField } from "../../services/src/spec-rules";

const db = new PrismaClient();
const DRY = process.argv.includes("--dry");
const limitIdx = process.argv.indexOf("--limit");
const LIMIT = limitIdx > -1 ? Number(process.argv[limitIdx + 1]) : Infinity;
const TIRE_CATS = ["PCR_TIRES", "LT_TIRES", "TBR_TIRES", "TRAILER_TIRES"] as const;
const MODEL = "claude-haiku-4-5-20251001";
const BATCH = 20;

// Prisma loads packages/database/.env on client init; make sure the key is
// there for plain-fetch use too (never printed).
function apiKey(): string {
  if (!process.env.ANTHROPIC_API_KEY) {
    try {
      const env = readFileSync(join(__dirname, "..", ".env"), "utf8");
      const m = env.match(/^ANTHROPIC_API_KEY=(.+)$/m);
      if (m) process.env.ANTHROPIC_API_KEY = m[1].trim();
    } catch {}
  }
  const k = process.env.ANTHROPIC_API_KEY;
  if (!k) throw new Error("ANTHROPIC_API_KEY not found in env or packages/database/.env");
  return k;
}

type Confidence = "high" | "medium" | "low";
type ProposedField = { value: string | number; confidence: Confidence };
type Proposal = { sku: string; fields: Record<string, ProposedField> };

const VOCAB = `Controlled vocabulary (reject anything else):
- treadType: mud-terrain | rugged-terrain | all-terrain | highway | touring | all-season | winter | high-performance | ultra-high-performance | rib | trailer
- position: steer | closed-shoulder-drive | open-shoulder-drive | trailer | all-position (only pick a drive variant when the shoulder design is stated or well known for that line)
- application: passenger | light-truck | commercial | trailer | atv-utv | golf-cart | lawn-garden | industrial | agricultural
- construction: R | D
- loadRange: single letter B C D E F G H J L
- plyRating: even integer 4-24
- loadIndex: digits like "121" or dual "121/118"
- speedRating: single letter H-Z (not O, X)`;

const SYSTEM = `You are a tire industry data specialist filling gaps in a wholesale distributor's catalog.
For each product you get its SKU, brand, size, description, category, and the list of MISSING fields.
Propose values ONLY for the listed missing fields, and only when you are reasonably confident from:
  (a) the text itself, or (b) well-known public knowledge of that exact tire line (brand + pattern).
Rules:
- NEVER guess stamped service values (loadIndex, speedRating, plyRating, loadRange) from general knowledge alone — only propose them if the text states them or the tire line has a single well-known rating for that exact size.
- Categorical fields (treadType, position, application, construction) may use tire-line knowledge.
- Commercial (TBR_TIRES) treadType is highway, rib, or trailer — all-terrain/mud-terrain are light-truck concepts.
- confidence: "high" = stated in text or unambiguous; "medium" = well-known tire-line fact; "low" = educated inference. Omit the field instead of proposing garbage.
${VOCAB}
Reply with ONLY a JSON array, one object per product that has at least one proposal:
[{"sku":"...","fields":{"treadType":{"value":"all-season","confidence":"high"}}}]
Products with no confident proposals are simply omitted. No prose, no markdown fences.`;

async function callClaude(batch: object[]): Promise<Proposal[]> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey(),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM,
      messages: [{ role: "user", content: JSON.stringify(batch) }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { content: { type: string; text?: string }[] };
  const text = data.content.find((c) => c.type === "text")?.text ?? "[]";
  const jsonStart = text.indexOf("[");
  const jsonEnd = text.lastIndexOf("]");
  if (jsonStart === -1 || jsonEnd === -1) return [];
  return JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as Proposal[];
}

// server-side validation lives in @rhino/services (validateSpecField) — the
// model's output is untrusted input and must pass the shared vocabulary gate.

async function main() {
  const products = await db.product.findMany({
    where: { category: { in: [...TIRE_CATS] }, active: true },
    select: { id: true, sku: true, brand: true, pattern: true, category: true, sizeSpec: true, description: true, rawCategory: true, tireSpec: true, specProposal: { select: { status: true } } },
    orderBy: { sku: "asc" },
  });

  // worklist: products with gaps and no still-pending proposal
  const work = products
    .map((p) => ({ p, gaps: specGaps((p.tireSpec ?? {}) as Record<string, unknown>, deriveSpecFromProduct(p)) }))
    .filter(({ p, gaps }) => gaps.length > 0 && p.specProposal?.status !== "PENDING")
    .slice(0, LIMIT);

  console.log(`gap worklist: ${work.length} products${Number.isFinite(LIMIT) ? ` (limited to ${LIMIT})` : ""}`);
  if (DRY) {
    const byField: Record<string, number> = {};
    work.forEach(({ gaps }) => gaps.forEach((g) => (byField[g] = (byField[g] ?? 0) + 1)));
    Object.entries(byField).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k.padEnd(14)} ${v}`));
    return;
  }

  let proposed = 0;
  let fieldsProposed = 0;
  let rejectedValues = 0;

  for (let i = 0; i < work.length; i += BATCH) {
    const slice = work.slice(i, i + BATCH);
    const payload = slice.map(({ p, gaps }) => ({
      sku: p.sku,
      brand: p.brand,
      pattern: p.pattern,
      size: p.sizeSpec,
      description: p.description,
      category: p.category,
      rawCategory: p.rawCategory,
      missing: gaps,
    }));

    let proposals: Proposal[] = [];
    try {
      proposals = await callClaude(payload);
    } catch (e) {
      console.error(`batch ${i / BATCH + 1} failed: ${(e as Error).message} — continuing`);
      continue;
    }

    for (const prop of proposals) {
      const item = slice.find((w) => w.p.sku === prop.sku);
      if (!item || !prop.fields) continue;
      const clean: Record<string, ProposedField> = {};
      for (const [f, pf] of Object.entries(prop.fields)) {
        if (!item.gaps.includes(f)) continue; // only fields we asked about
        const valid = pf?.value === undefined ? null : validateSpecField(f, pf.value);
        if (valid === null) { rejectedValues++; continue; }
        clean[f] = { value: valid, confidence: (["high", "medium", "low"] as const).includes(pf.confidence) ? pf.confidence : "low" };
      }
      if (Object.keys(clean).length === 0) continue;
      await db.specProposal.upsert({
        where: { productId: item.p.id },
        update: { fieldsJson: clean, status: "PENDING", reviewedAt: null, reviewedById: null },
        create: { productId: item.p.id, fieldsJson: clean, status: "PENDING" },
      });
      proposed++;
      fieldsProposed += Object.keys(clean).length;
    }
    console.log(`batch ${i / BATCH + 1}/${Math.ceil(work.length / BATCH)}: ${proposals.length} proposals`);
  }

  console.log(`\nproducts with new PENDING proposals: ${proposed}`);
  console.log(`fields proposed: ${fieldsProposed}, invalid values rejected: ${rejectedValues}`);
}

main().finally(() => db.$disconnect());
