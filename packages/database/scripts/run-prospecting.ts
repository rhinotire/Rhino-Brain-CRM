// packages/database/scripts/run-prospecting.ts
/**
 * CLI wrapper for the shared prospecting pipeline
 * (packages/services/src/prospect-pipeline.ts — same code the CRM's in-page
 * collection form uses).
 *
 *   pnpm --filter @rhino/database exec tsx scripts/run-prospecting.ts --state TX --category p4 --limit 40
 *   --category p4|p3|p1  (P4 truck first — owner priority)
 *   --dry                collect + filter only, no AI, no writes
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "../src";
import { runProspectingPipeline, type ProspectCategory } from "../../services/src/prospect-pipeline";

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}

// same env fallback as ai-propose-specs.ts — Prisma loads .env for its own use
function ensureEnv(name: string) {
  if (process.env[name]) return;
  try {
    const env = readFileSync(join(__dirname, "..", ".env"), "utf8");
    const m = env.match(new RegExp(`^${name}="?([^"\\n]+)"?`, "m"));
    if (m) process.env[name] = m[1];
  } catch { /* handled by the explicit checks below */ }
}

async function main() {
  ensureEnv("GOOGLE_PLACES_API_KEY");
  ensureEnv("ANTHROPIC_API_KEY");
  const placesKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!placesKey) throw new Error("GOOGLE_PLACES_API_KEY not set");

  const result = await runProspectingPipeline({
    country: (arg("country", "US") ?? "US").toUpperCase(),
    state: (arg("state") ?? "").toUpperCase(),
    category: arg("category", "p4") as ProspectCategory,
    customQuery: arg("query"),
    limit: Number(arg("limit", "40")),
    placesKey,
    dry: process.argv.includes("--dry"),
  });
  console.log(result);
}

main().finally(() => db.$disconnect());
