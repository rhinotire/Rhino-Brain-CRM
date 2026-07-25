# Prospecting Lead Engine (Phase 1a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the lead-generation half of the AI prospecting agent: schema, exclusion (protection) pool, seed import, Google Places collector, website enrichment, AI six-check scoring with A/B/C/D×H/M/L grading, and the CRM calibration queue.

**Architecture:** Collectors and scoring live in `packages/services` as pure-logic modules (AI/network calls injected so vitest tests need no mocks of Prisma). Orchestration scripts live in `packages/database/scripts` (run via `pnpm exec tsx`, same as `ai-propose-specs.ts`). The CRM UI is one new page in `apps/rhino-brain` following the `/spec-review` review-queue pattern. Outreach (email sending, campaigns, mailboxes) is a SEPARATE later plan — nothing here sends anything.

**Tech Stack:** Prisma 5.19 (pnpm workspace `@rhino/database`), vitest (in `@rhino/services`), Next.js App Router server actions/components, Claude API via plain `fetch` (pattern from `packages/database/scripts/ai-propose-specs.ts`), Google Places API (New) Text Search.

**Spec:** `docs/superpowers/specs/2026-07-24-ai-prospecting-agent-design.md` (commit af14438)

## Global Constraints

- Campaign/product-line priority (owner): **P4 truck/TBR first** (commercial tire dealers, truck shops, fleets, transportation companies), P3 PCR second, P1/P2 trailer third.
- Company isolation: reps only see leads of their own `locationId` (existing `locationScope()` in `apps/rhino-brain/src/lib/auth.ts`). Calibration queue is manager-only (`requireManager()`).
- ExclusionList is sacred: nothing in this plan or any later plan may auto-touch an excluded company. The check helper built here (`isExcluded`) is the single gate later plans must call.
- Reuse `phoneKey`, `domainKey`, `nameKey` from `packages/services/src/referral-matching.ts` — do not re-implement normalization.
- No new runtime deps in `@rhino/services` beyond what exists (zod, etc.). Claude calls use `fetch`. Model default `claude-haiku-4-5-20251001`, override via `PROSPECT_AI_MODEL`.
- Env vars used (all optional at runtime, features degrade with clear errors): `ANTHROPIC_API_KEY` (exists), `GOOGLE_PLACES_API_KEY` (new).
- All UI copy English (matches existing CRM). Money USD.
- Never use contact info from the iSales vendor demo docs anywhere.
- Commits: end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## File Structure

```
packages/database/prisma/schema.prisma          MODIFY  enums + Lead fields + ExclusionList + SourceRun
packages/services/src/prospect-dedupe.ts        CREATE  dedupeKeyFor()
packages/services/src/prospect-dedupe.test.ts   CREATE
packages/services/src/exclusion-service.ts      CREATE  matchesExclusion() pure + isExcluded() db wrapper + addExclusion()
packages/services/src/exclusion-service.test.ts CREATE
packages/services/src/claude-json.ts            CREATE  askClaudeJson() fetch helper (injectable)
packages/services/src/places-collector.ts       CREATE  searchPlacesPage() (fetch injected)
packages/services/src/places-collector.test.ts  CREATE
packages/services/src/prospect-enrich.ts        CREATE  fetchSiteText() + extractEnrichment()
packages/services/src/prospect-enrich.test.ts   CREATE
packages/services/src/prospect-score.ts         CREATE  scoreProspect() + assignStateLocation()
packages/services/src/prospect-score.test.ts    CREATE
packages/services/src/index.ts                  MODIFY  export new modules
packages/database/scripts/seed-exclusions.ts    CREATE  competitors + existing customers → ExclusionList
packages/database/scripts/seed-prospect-leads.ts CREATE 30 seed companies → Lead
packages/database/scripts/run-prospecting.ts    CREATE  orchestrator: collect → dedupe/exclude → enrich → score
apps/rhino-brain/src/actions/prospecting.ts     CREATE  server actions: queue list + calibrate
apps/rhino-brain/src/components/prospect-card.tsx CREATE
apps/rhino-brain/src/app/(app)/prospecting/page.tsx CREATE calibration queue page
```

---

### Task 1: Schema — prospecting enums, Lead extensions, ExclusionList, SourceRun

**Files:**
- Modify: `packages/database/prisma/schema.prisma`

**Interfaces:**
- Produces: enums `ProspectPool { A_BUYER B_PROJECT C_CHANNEL D_EXCLUDED }`, `ProspectConfidence { H M L }`, `ProspectProductLine { P1_TRAILER_TIRE P2_TRAILER_WHEEL P3_PCR P4_TBR P5_OTR }`, `ExclusionKind { EXISTING_CUSTOMER AGENT COMPETITOR OPTED_OUT RISK }`, `ProspectSourceKind { SEED REVIVAL GOOGLE_PLACES WEB_SCRAPE CUSTOMS }`; models `ExclusionList`, `SourceRun`; Lead fields `pool/confidence/productLine/country/score/scoreReasons/enrichment/dedupeKey/sourceRunId/reviewedAt/reviewedById/rejectReason`; `CustomerSource` gains `PROSPECTING`.

- [ ] **Step 1: Add enums to schema** (after the existing `enum LostReason` block)

```prisma
enum ProspectPool {
  A_BUYER    // direct buyer — can enter auto outreach once reviewed
  B_PROJECT  // OEM / big retail — project pool, first-touch only
  C_CHANNEL  // channel value unclear — manual verify
  D_EXCLUDED // protected / competitor / invalid
}

enum ProspectConfidence {
  H
  M
  L
}

enum ProspectProductLine {
  P1_TRAILER_TIRE
  P2_TRAILER_WHEEL
  P3_PCR
  P4_TBR
  P5_OTR
}

enum ExclusionKind {
  EXISTING_CUSTOMER
  AGENT
  COMPETITOR
  OPTED_OUT
  RISK
}

enum ProspectSourceKind {
  SEED
  REVIVAL
  GOOGLE_PLACES
  WEB_SCRAPE
  CUSTOMS
}
```

- [ ] **Step 2: Add `PROSPECTING` to `enum CustomerSource`** (append before `OTHER`)

- [ ] **Step 3: Extend `model Lead`** — add below the existing `meta Json?` line:

```prisma
  // ---- AI prospecting (spec 2026-07-24) ----
  pool        ProspectPool?
  confidence  ProspectConfidence?
  productLine ProspectProductLine?
  country     String              @default("US")
  score       Int?
  scoreReasons Json? // six-check results: [{check, pass, evidence}]
  enrichment  Json? // website extraction: emails, brandsSold, wholesale signals…
  dedupeKey   String? @unique // domain || phone || name+city (prospect-dedupe.ts)
  sourceRunId String?
  sourceRun   SourceRun? @relation(fields: [sourceRunId], references: [id])
  reviewedAt   DateTime? // calibration verdict timestamp
  reviewedById String?
  reviewedBy   User?     @relation("ReviewedLeads", fields: [reviewedById], references: [id])
  rejectReason String?
```

Also add to `model User` relations: `reviewedLeads Lead[] @relation("ReviewedLeads")` and add `@@index([pool, reviewedAt])` to Lead.

- [ ] **Step 4: Add new models** (place near `model Lead`):

```prisma
// Protection / suppression pool. Checked before ANY outreach — see
// packages/services/src/exclusion-service.ts. Never auto-touch a match.
model ExclusionList {
  id          String        @id @default(cuid())
  kind        ExclusionKind
  companyName String
  domain      String? // domainKey()-normalized
  phone       String? // phoneKey()-normalized (last 10 digits)
  reason      String?
  reviewAt    DateTime? // when to re-check whether exclusion still applies
  addedById   String?
  createdAt   DateTime      @default(now())

  @@index([domain])
  @@index([phone])
}

// One collection run (Places sweep, seed import, …) — cost ledger + provenance.
model SourceRun {
  id           String             @id @default(cuid())
  source       ProspectSourceKind
  params       Json // {state, category, limit, …}
  resultCount  Int                @default(0)
  newLeadCount Int                @default(0)
  dupCount     Int                @default(0)
  excludedCount Int               @default(0)
  apiCostUsd   Float              @default(0)
  inputTokens  Int                @default(0)
  outputTokens Int                @default(0)
  createdAt    DateTime           @default(now())

  leads Lead[]
}
```

- [ ] **Step 5: Migrate**

Run: `pnpm --filter @rhino/database run db:migrate -- --name prospecting_lead_engine`
Expected: new folder `packages/database/prisma/migrations/*_prospecting_lead_engine`, `prisma generate` runs clean.
(If the pooled 6543 connection rejects migrate, follow existing repo practice for prior migrations — the direct 5432 URL in `packages/database/.env` — do NOT switch to `db push`.)

- [ ] **Step 6: Commit**

```bash
git add packages/database/prisma
git commit -m "feat(prospecting): schema — pools, exclusion list, source runs (spec 2026-07-24)"
```

---

### Task 2: `prospect-dedupe` — stable dedupe key

**Files:**
- Create: `packages/services/src/prospect-dedupe.ts`
- Test: `packages/services/src/prospect-dedupe.test.ts`

**Interfaces:**
- Consumes: `domainKey`, `phoneKey`, `nameKey` from `./referral-matching`
- Produces: `dedupeKeyFor(input: { website?: string | null; phone?: string | null; companyName?: string | null; city?: string | null }): string` — returns `"d:<domain>"` | `"p:<phone10>"` | `"n:<namekey>:<city>"` | `""` (in that priority order; empty string = not dedupable, caller must skip uniqueness insert).

- [ ] **Step 1: Write the failing test**

```typescript
// packages/services/src/prospect-dedupe.test.ts
import { describe, expect, it } from "vitest";
import { dedupeKeyFor } from "./prospect-dedupe";

describe("dedupeKeyFor", () => {
  it("prefers domain over phone and name", () => {
    expect(
      dedupeKeyFor({ website: "https://www.mccarthytire.com/about", phone: "(570) 555-1234", companyName: "McCarthy Tire" })
    ).toBe("d:mccarthytire.com");
  });
  it("falls back to phone last-10", () => {
    expect(dedupeKeyFor({ phone: "+1 (407) 555-9876", companyName: "X" })).toBe("p:4075559876");
  });
  it("falls back to nameKey + lowercased city", () => {
    expect(dedupeKeyFor({ companyName: "Bob's Tire Shop LLC", city: "Orlando" })).toBe("n:bobs:orlando");
  });
  it("returns empty string when nothing usable", () => {
    expect(dedupeKeyFor({ companyName: "The Tire Co" })).toBe(""); // nameKey too short, no city
    expect(dedupeKeyFor({})).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rhino/services exec vitest run src/prospect-dedupe.test.ts`
Expected: FAIL — Cannot find module './prospect-dedupe'

- [ ] **Step 3: Implement**

```typescript
// packages/services/src/prospect-dedupe.ts
import { domainKey, nameKey, phoneKey } from "./referral-matching";

/**
 * Stable identity key for a prospect so re-running collectors never creates
 * duplicates (Lead.dedupeKey is @unique). Priority: domain > phone > name+city.
 * "" means "not dedupable" — caller must NOT write "" into the unique column.
 */
export function dedupeKeyFor(input: {
  website?: string | null;
  phone?: string | null;
  companyName?: string | null;
  city?: string | null;
}): string {
  const d = domainKey(input.website);
  if (d) return `d:${d}`;
  const p = phoneKey(input.phone);
  if (p) return `p:${p}`;
  const n = nameKey(input.companyName);
  const city = (input.city ?? "").trim().toLowerCase();
  if (n.length >= 4 && city) return `n:${n}:${city}`;
  return "";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rhino/services exec vitest run src/prospect-dedupe.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Export from `packages/services/src/index.ts`** — add:

```typescript
export { dedupeKeyFor } from "./prospect-dedupe";
```

- [ ] **Step 6: Commit**

```bash
git add packages/services/src/prospect-dedupe.ts packages/services/src/prospect-dedupe.test.ts packages/services/src/index.ts
git commit -m "feat(prospecting): dedupe key (domain > phone > name+city)"
```

---

### Task 3: `exclusion-service` — the protection gate

**Files:**
- Create: `packages/services/src/exclusion-service.ts`
- Test: `packages/services/src/exclusion-service.test.ts`

**Interfaces:**
- Consumes: `domainKey`, `phoneKey`, `nameKey` from `./referral-matching`; `db` from `@rhino/database`
- Produces:
  - `type ExclusionRow = { kind: string; companyName: string; domain: string | null; phone: string | null }`
  - `matchesExclusion(candidate: { companyName?: string | null; website?: string | null; phone?: string | null }, rows: ExclusionRow[]): ExclusionRow | null` — pure, unit-testable
  - `isExcluded(candidate): Promise<ExclusionRow | null>` — db wrapper (loads rows, calls pure fn). **This is the single gate every outreach/collector path must call.**
  - `addExclusion(input: { kind: ExclusionKind; companyName: string; website?: string | null; phone?: string | null; reason?: string; addedById?: string }): Promise<void>` — normalizes before insert.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/services/src/exclusion-service.test.ts
import { describe, expect, it } from "vitest";
import { matchesExclusion, type ExclusionRow } from "./exclusion-service";

const rows: ExclusionRow[] = [
  { kind: "COMPETITOR", companyName: "Tredit Tire & Wheel", domain: "tredit.com", phone: null },
  { kind: "EXISTING_CUSTOMER", companyName: "Sunshine Tires LLC", domain: null, phone: "4075551234" },
  { kind: "AGENT", companyName: "Gulf Coast Wholesale Tire", domain: null, phone: null },
];

describe("matchesExclusion", () => {
  it("matches by normalized domain", () => {
    const hit = matchesExclusion({ website: "https://www.tredit.com/products" }, rows);
    expect(hit?.kind).toBe("COMPETITOR");
  });
  it("matches by normalized phone", () => {
    const hit = matchesExclusion({ phone: "+1 407-555-1234" }, rows);
    expect(hit?.kind).toBe("EXISTING_CUSTOMER");
  });
  it("matches by name key when no domain/phone on row", () => {
    const hit = matchesExclusion({ companyName: "Gulf Coast Wholesale Tire Inc" }, rows);
    expect(hit?.kind).toBe("AGENT");
  });
  it("does not match unrelated company", () => {
    expect(matchesExclusion({ companyName: "Lone Star Truck Tires", website: "lonestartt.com" }, rows)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rhino/services exec vitest run src/exclusion-service.test.ts`
Expected: FAIL — Cannot find module './exclusion-service'

- [ ] **Step 3: Implement**

```typescript
// packages/services/src/exclusion-service.ts
import { db } from "@rhino/database";
import { domainKey, nameKey, phoneKey } from "./referral-matching";

/**
 * Protection pool gate (spec §8.1). isExcluded() MUST be called before any
 * outreach send and before creating leads from collectors. Matching is
 * conservative-inclusive: domain OR phone OR (nameKey when the row has no
 * stronger identifier) → excluded.
 */
export type ExclusionRow = {
  kind: string;
  companyName: string;
  domain: string | null;
  phone: string | null;
};

export function matchesExclusion(
  candidate: { companyName?: string | null; website?: string | null; phone?: string | null },
  rows: ExclusionRow[]
): ExclusionRow | null {
  const cd = domainKey(candidate.website);
  const cp = phoneKey(candidate.phone);
  const cn = nameKey(candidate.companyName);
  for (const r of rows) {
    if (r.domain && cd && r.domain === cd) return r;
    if (r.phone && cp && r.phone === cp) return r;
    if (!r.domain && !r.phone) {
      const rn = nameKey(r.companyName);
      if (rn.length >= 4 && rn === cn) return r;
    }
  }
  return null;
}

export async function isExcluded(candidate: {
  companyName?: string | null;
  website?: string | null;
  phone?: string | null;
}): Promise<ExclusionRow | null> {
  const rows = await db.exclusionList.findMany({
    select: { kind: true, companyName: true, domain: true, phone: true },
  });
  return matchesExclusion(candidate, rows);
}

export async function addExclusion(input: {
  kind: "EXISTING_CUSTOMER" | "AGENT" | "COMPETITOR" | "OPTED_OUT" | "RISK";
  companyName: string;
  website?: string | null;
  phone?: string | null;
  reason?: string;
  addedById?: string;
}): Promise<void> {
  await db.exclusionList.create({
    data: {
      kind: input.kind,
      companyName: input.companyName.trim(),
      domain: domainKey(input.website) || null,
      phone: phoneKey(input.phone) || null,
      reason: input.reason ?? null,
      addedById: input.addedById ?? null,
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rhino/services exec vitest run src/exclusion-service.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Export from index.ts** — add:

```typescript
export { matchesExclusion, isExcluded, addExclusion, type ExclusionRow } from "./exclusion-service";
```

- [ ] **Step 6: Commit**

```bash
git add packages/services/src/exclusion-service.ts packages/services/src/exclusion-service.test.ts packages/services/src/index.ts
git commit -m "feat(prospecting): exclusion gate — protection pool matching"
```

---

### Task 4: Seed the protection pool

**Files:**
- Create: `packages/database/scripts/seed-exclusions.ts`

**Interfaces:**
- Consumes: `addExclusion` semantics (writes ExclusionList directly with the same normalization — script imports from `../../services/src/exclusion-service` like `ai-propose-specs.ts` imports `spec-rules`).
- Produces: ExclusionList populated (idempotent: skips rows whose companyName already exists).

- [ ] **Step 1: Write the script**

```typescript
// packages/database/scripts/seed-exclusions.ts
/**
 * Protection-pool init (spec §3.2, §7 D-pool):
 *  1. every existing Customer (kind=EXISTING_CUSTOMER)
 *  2. named competitors / supply-chain giants from the market analysis
 * Idempotent — re-running skips existing companyName+kind rows.
 *
 *   pnpm --filter @rhino/database exec tsx scripts/seed-exclusions.ts
 */
import { PrismaClient } from "@prisma/client";
import { domainKey, phoneKey } from "../../services/src/referral-matching";

const db = new PrismaClient();

const COMPETITORS: Array<{ name: string; website?: string }> = [
  { name: "Tredit Tire & Wheel", website: "tredit.com" },
  { name: "Lionshead Tire & Wheel", website: "lionsheadtireandwheel.com" },
  { name: "Taskmaster Components", website: "taskmastercomponents.com" },
  { name: "Martin Wheel", website: "martinwheel.com" },
  { name: "Dexter Axle", website: "dexteraxle.com" },
  { name: "TexTrail Trailer Parts", website: "textrail.com" },
  { name: "Redneck Trailer Supplies", website: "redneck-trailer.com" },
];

async function main() {
  const existing = new Set(
    (await db.exclusionList.findMany({ select: { companyName: true, kind: true } })).map(
      (r) => `${r.kind}:${r.companyName.toLowerCase()}`
    )
  );
  let added = 0;

  for (const c of COMPETITORS) {
    if (existing.has(`COMPETITOR:${c.name.toLowerCase()}`)) continue;
    await db.exclusionList.create({
      data: { kind: "COMPETITOR", companyName: c.name, domain: domainKey(c.website) || null, reason: "market analysis 2026-07-24" },
    });
    added++;
  }

  const customers = await db.customer.findMany({
    select: { companyName: true, phone: true, contactCell: true, website: true },
  });
  for (const c of customers) {
    if (!c.companyName || existing.has(`EXISTING_CUSTOMER:${c.companyName.toLowerCase()}`)) continue;
    existing.add(`EXISTING_CUSTOMER:${c.companyName.toLowerCase()}`);
    await db.exclusionList.create({
      data: {
        kind: "EXISTING_CUSTOMER",
        companyName: c.companyName,
        domain: domainKey(c.website) || null,
        phone: phoneKey(c.phone) || phoneKey(c.contactCell) || null,
        reason: "auto-import from Customer table",
      },
    });
    added++;
  }
  console.log(`exclusions added: ${added}, total now: ${await db.exclusionList.count()}`);
}

main().finally(() => db.$disconnect());
```

- [ ] **Step 2: Run it**

Run: `pnpm --filter @rhino/database exec tsx scripts/seed-exclusions.ts`
Expected: `exclusions added: <7 + customer count>, total now: <same>`; second run adds 0.

- [ ] **Step 3: Commit**

```bash
git add packages/database/scripts/seed-exclusions.ts
git commit -m "feat(prospecting): protection pool seed — customers + competitors"
```

---

### Task 5: Seed the 30 named prospect companies

**Files:**
- Create: `packages/database/scripts/seed-prospect-leads.ts`

**Interfaces:**
- Consumes: `dedupeKeyFor` from services; `isExcluded`-style check via `matchesExclusion` (script loads rows once).
- Produces: Leads with `source: "PROSPECTING"`, pool/confidence/productLine preset, `meta.angle` = first-touch angle, `notes` = evidence summary. SourceRun row `source: SEED`.

- [ ] **Step 1: Write the script** (data straight from spec §7; angles condensed from the market analysis)

```typescript
// packages/database/scripts/seed-prospect-leads.ts
/**
 * Seed the ~30 named target companies from the 2026-07-24 market analysis
 * (spec §7). Grades preset; humans re-verify in the calibration queue.
 * Idempotent via Lead.dedupeKey.
 *
 *   pnpm --filter @rhino/database exec tsx scripts/seed-prospect-leads.ts
 */
import { PrismaClient, type ProspectPool, type ProspectConfidence, type ProspectProductLine } from "@prisma/client";
import { dedupeKeyFor } from "../../services/src/prospect-dedupe";
import { matchesExclusion } from "../../services/src/exclusion-service";

const db = new PrismaClient();

type Seed = {
  name: string; website: string; state?: string;
  pool: ProspectPool; confidence: ProspectConfidence; line: ProspectProductLine;
  angle: string;
};

// P4/P5 commercial line first — owner priority 2026-07-24.
const SEEDS: Seed[] = [
  { name: "Purcell Tire & Service", website: "purcelltire.com", pool: "A_BUYER", confidence: "H", line: "P4_TBR", angle: "71 locations, commercial/OTR/ag + distribution. Pitch second-source supply for one chosen duty cycle + cost model. Do NOT lead with price alone." },
  { name: "McCarthy Tire Service", website: "mccarthytire.com", pool: "A_BUYER", confidence: "H", line: "P4_TBR", angle: "East-coast commercial/fleet/OTR group, 75+ locations. Pick one duty cycle/size, pitch supply stability + cost-per-mile. Needs warranty story." },
  { name: "Parrish Tire Wholesale", website: "parrishtire.com", pool: "A_BUYER", confidence: "H", line: "P3_PCR", angle: "Multi-state wholesale DCs, PCR/TBR/ag, open to private label. Find price-band/size gaps; offer regional protection + stock support." },
  { name: "K&M Tire", website: "kmtire.com", state: "OH", pool: "A_BUYER", confidence: "M", line: "P3_PCR", angle: "Wholesale dealer program exists; verify warehouse network + category fit before touching." },
  { name: "The Trailer Parts Outlet", website: "thetrailerpartsoutlet.com", state: "TX", pool: "A_BUYER", confidence: "H", line: "P1_TRAILER_TIRE", angle: "Sells 13–17.5\" ST tires + preassembled tire/wheel by the pallet. Pitch fill-in load ranges, assembly specs, steady lead time. Verify AD/CVD exposure first — never quote a duty rate." },
  { name: "Southwest Wheel", website: "southwestwheel.com", state: "TX", pool: "A_BUYER", confidence: "H", line: "P2_TRAILER_WHEEL", angle: "Full trailer parts line (axles, brakes, wheels, jacks, couplers, Dexter). Pitch ST assembly + wheel + jack/coupler supplement matrix, not a full catalog." },
  { name: "Eastern Marine / Trailer Parts Superstore", website: "easternmarine.com", state: "DE", pool: "A_BUYER", confidence: "H", line: "P1_TRAILER_TIRE", angle: "Boat/RV/utility trailer parts since 1981. Pitch size + corrosion-resistant wheel matrix by scenario; US stock replenishment." },
  { name: "RecStuff", website: "recstuff.com", state: "WI", pool: "A_BUYER", confidence: "H", line: "P1_TRAILER_TIRE", angle: "Tire/wheel/assembly by trailer type, wholesale inquiry page, 8–18\". One-page catalog-gap list, not the full lineup." },
  { name: "etrailer", website: "etrailer.com", state: "MO", pool: "A_BUYER", confidence: "H", line: "P1_TRAILER_TIRE", angle: "Big vertical e-commerce, tests products. Offer a specific testable SKU + DOT/quality/packaging/content pack. Project-style, high bar." },
  { name: "Big Tex Trailer World", website: "bigtextrailerworld.com", state: "TX", pool: "A_BUYER", confidence: "M", line: "P1_TRAILER_TIRE", angle: "Multi-state dealer/service network, 4000+ parts. Verify central purchasing + existing supply deals first." },
  { name: "Sturdy Built Trailer Parts", website: "sturdybuiltonline.com", pool: "A_BUYER", confidence: "M", line: "P1_TRAILER_TIRE", angle: "Mid-size vertical channel, short decision chain — good early sample customer. Verify import capability." },
  { name: "Leonard Truck Outfitters", website: "leonardusa.com", pool: "A_BUYER", confidence: "M", line: "P1_TRAILER_TIRE", angle: "Trailer + truck accessories + service, multiple locations. Verify purchasing centralization." },
  // B pool — OEM / big retail. First-touch email OK (needs-discovery only); no credential claims until DOT/warranty pack ready (spec §8.6).
  { name: "Big Tex Trailers", website: "bigtextrailers.com", state: "TX", pool: "B_PROJECT", confidence: "H", line: "P1_TRAILER_TIRE", angle: "Major trailer OEM. Entry via specific SKU cost/delivery or aftermarket parts." },
  { name: "PJ Trailers", website: "pjtrailers.com", state: "TX", pool: "B_PROJECT", confidence: "H", line: "P1_TRAILER_TIRE", angle: "Pro-grade trailer OEM; long supplier-approval cycle." },
  { name: "Carry-On Trailer", website: "carry-ontrailer.com", pool: "B_PROJECT", confidence: "H", line: "P1_TRAILER_TIRE", angle: "Volume utility/cargo OEM; confirm group supplier process." },
  { name: "Diamond C Trailers", website: "diamondc.com", state: "TX", pool: "B_PROJECT", confidence: "M", line: "P1_TRAILER_TIRE", angle: "Heavy-duty/gooseneck; high quality bar — 17.5\" assemblies." },
  { name: "Load Trail", website: "loadtrail.com", state: "TX", pool: "B_PROJECT", confidence: "M", line: "P1_TRAILER_TIRE", angle: "OEM + dealer network; start with supplier registration." },
  { name: "Aluma Trailers", website: "alumaklm.com", pool: "B_PROJECT", confidence: "M", line: "P2_TRAILER_WHEEL", angle: "Aluminum trailers — aluminum wheels, corrosion/finish evidence needed." },
  { name: "Tractor Supply", website: "tractorsupply.com", pool: "B_PROJECT", confidence: "M", line: "P1_TRAILER_TIRE", angle: "National farm retail. Phase-3 target: vendor onboarding/EDI heavy — do not auto-touch." },
  { name: "Tire Rack", website: "tirerack.com", pool: "B_PROJECT", confidence: "M", line: "P3_PCR", angle: "Phase-3: differentiated brand/exclusive-spec validation only." },
  // C pool — channel, verify before anything.
  { name: "TrailerTires.com", website: "trailertires.com", pool: "C_CHANNEL", confidence: "H", line: "P1_TRAILER_TIRE", angle: "Vertical e-commerce; may be Eastern Marine-affiliated — dedupe entity first." },
  { name: "Trailer Parts Depot", website: "trailerpartsdepot.com", pool: "C_CHANNEL", confidence: "M", line: "P1_TRAILER_TIRE", angle: "Verify scale + import capability." },
  { name: "Champion Trailers", website: "championtrailers.com", pool: "C_CHANNEL", confidence: "M", line: "P1_TRAILER_TIRE", angle: "Kits/parts/repair; central purchasing unverified." },
  { name: "Six Robblees", website: "sixrobblees.com", state: "WA", pool: "C_CHANNEL", confidence: "M", line: "P4_TBR", angle: "NW truck/trailer parts distributor; verify tire/wheel purchasing authority." },
  { name: "National Trailer Source", website: "nationaltrailersource.com", pool: "C_CHANNEL", confidence: "M", line: "P1_TRAILER_TIRE", angle: "Multi-store dealer; confirm central purchasing + brand strategy." },
  { name: "Northern Tool + Equipment", website: "northerntool.com", pool: "C_CHANNEL", confidence: "M", line: "P1_TRAILER_TIRE", angle: "Closer to B pool; hold in manual pool until vendor path known." },
  { name: "FleetPride", website: "fleetpride.com", state: "TX", pool: "C_CHANNEL", confidence: "M", line: "P4_TBR", angle: "Heavy-duty aftermarket network; wheels/trailer parts overlap, verify tire purchasing scope." },
  { name: "RNR Tire Express", website: "rnrtires.com", state: "FL", pool: "C_CHANNEL", confidence: "L", line: "P3_PCR", angle: "Franchise retail; central purchasing/import logic unclear." },
];

async function main() {
  const exclusions = await db.exclusionList.findMany({
    select: { kind: true, companyName: true, domain: true, phone: true },
  });
  const run = await db.sourceRun.create({
    data: { source: "SEED", params: { doc: "spec §7 seed list", count: SEEDS.length } },
  });
  let created = 0, dups = 0, excluded = 0;

  for (const s of SEEDS) {
    if (matchesExclusion({ companyName: s.name, website: s.website }, exclusions)) { excluded++; continue; }
    const key = dedupeKeyFor({ website: s.website, companyName: s.name });
    if (!key) continue;
    const dup = await db.lead.findFirst({ where: { dedupeKey: key }, select: { id: true } });
    if (dup) { dups++; continue; }
    await db.lead.create({
      data: {
        companyName: s.name,
        state: s.state ?? null,
        type: s.line.startsWith("P1") || s.line.startsWith("P2") ? "TRAILER_MANUFACTURER" : "WHOLESALE_DEALER",
        source: "PROSPECTING",
        interest: s.line === "P4_TBR" ? "TBR_TIRES" : s.line === "P3_PCR" ? "PCR_TIRES" : s.line === "P2_TRAILER_WHEEL" ? "WHEELS" : "TRAILER_TIRES",
        stage: "NEW_LEAD",
        pool: s.pool,
        confidence: s.confidence,
        productLine: s.line,
        dedupeKey: key,
        sourceRunId: run.id,
        notes: `Seed from market analysis 2026-07-24.`,
        meta: { website: s.website, angle: s.angle },
      },
    });
    created++;
  }
  await db.sourceRun.update({
    where: { id: run.id },
    data: { resultCount: SEEDS.length, newLeadCount: created, dupCount: dups, excludedCount: excluded },
  });
  console.log({ created, dups, excluded });
}

main().finally(() => db.$disconnect());
```

- [ ] **Step 2: Run it**

Run: `pnpm --filter @rhino/database exec tsx scripts/seed-prospect-leads.ts`
Expected: `{ created: 28, dups: 0, excluded: 0 }` first run (28 = list length); second run `{ created: 0, dups: 28, excluded: 0 }`.

- [ ] **Step 3: Commit**

```bash
git add packages/database/scripts/seed-prospect-leads.ts
git commit -m "feat(prospecting): seed 28 named target companies with pool grades"
```

---

### Task 6: `claude-json` helper + website enrichment

**Files:**
- Create: `packages/services/src/claude-json.ts`
- Create: `packages/services/src/prospect-enrich.ts`
- Test: `packages/services/src/prospect-enrich.test.ts`

**Interfaces:**
- Produces (claude-json): `askClaudeJson(opts: { system: string; user: string; maxTokens?: number; model?: string; fetchFn?: typeof fetch }): Promise<{ json: unknown; inputTokens: number; outputTokens: number }>` — throws if `ANTHROPIC_API_KEY` missing; strips ```json fences before parse.
- Produces (enrich): `type Enrichment = { emails: string[]; brandsSold: string[]; sellsWholesale: boolean | null; businessSummary: string; buyerSignals: string[] }`; `fetchSiteText(url: string, fetchFn?: typeof fetch): Promise<string>` (10s timeout, tags stripped, 8000-char cap, "" on failure); `extractEnrichment(siteText: string, companyName: string, ask?: typeof askClaudeJson): Promise<{ enrichment: Enrichment; inputTokens: number; outputTokens: number }>`.

- [ ] **Step 1: Write claude-json.ts**

```typescript
// packages/services/src/claude-json.ts
/**
 * Minimal Claude JSON caller for batch/services use (no SDK dep — same
 * plain-fetch pattern as packages/database/scripts/ai-propose-specs.ts).
 */
const DEFAULT_MODEL = process.env.PROSPECT_AI_MODEL || "claude-haiku-4-5-20251001";

export async function askClaudeJson(opts: {
  system: string;
  user: string;
  maxTokens?: number;
  model?: string;
  fetchFn?: typeof fetch;
}): Promise<{ json: unknown; inputTokens: number; outputTokens: number }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  const f = opts.fetchFn ?? fetch;
  const res = await f("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: opts.model ?? DEFAULT_MODEL,
      max_tokens: opts.maxTokens ?? 1500,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as {
    content: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = body.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  return {
    json: JSON.parse(cleaned),
    inputTokens: body.usage?.input_tokens ?? 0,
    outputTokens: body.usage?.output_tokens ?? 0,
  };
}
```

- [ ] **Step 2: Write the failing enrichment test** (inject fake fetch/ask — no network)

```typescript
// packages/services/src/prospect-enrich.test.ts
import { describe, expect, it } from "vitest";
import { extractEnrichment, fetchSiteText } from "./prospect-enrich";

const fakeAsk = (async () => ({
  json: {
    emails: ["sales@lonestartt.com"],
    brandsSold: ["Sailun", "Westlake"],
    sellsWholesale: true,
    businessSummary: "Regional commercial tire distributor in Texas.",
    buyerSignals: ["dealer login page", "pallet pricing mentioned"],
  },
  inputTokens: 500,
  outputTokens: 120,
})) as never;

describe("extractEnrichment", () => {
  it("returns parsed enrichment + token counts", async () => {
    const r = await extractEnrichment("<html>…site text…</html>", "Lone Star Truck Tires", fakeAsk);
    expect(r.enrichment.sellsWholesale).toBe(true);
    expect(r.enrichment.brandsSold).toContain("Sailun");
    expect(r.outputTokens).toBe(120);
  });
  it("normalizes a malformed payload to safe defaults", async () => {
    const badAsk = (async () => ({ json: { emails: "not-an-array" }, inputTokens: 1, outputTokens: 1 })) as never;
    const r = await extractEnrichment("x", "Y", badAsk);
    expect(r.enrichment.emails).toEqual([]);
    expect(r.enrichment.sellsWholesale).toBeNull();
  });
});

describe("fetchSiteText", () => {
  it("strips tags and caps length", async () => {
    const fakeFetch = (async () => new Response("<html><script>x()</script><body><h1>Truck Tires</h1><p>Wholesale pallets</p></body></html>")) as typeof fetch;
    const text = await fetchSiteText("https://example.com", fakeFetch);
    expect(text).toContain("Truck Tires");
    expect(text).toContain("Wholesale pallets");
    expect(text).not.toContain("<h1>");
    expect(text).not.toContain("x()");
  });
  it("returns empty string on fetch failure", async () => {
    const failFetch = (async () => { throw new Error("boom"); }) as unknown as typeof fetch;
    expect(await fetchSiteText("https://example.com", failFetch)).toBe("");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @rhino/services exec vitest run src/prospect-enrich.test.ts`
Expected: FAIL — Cannot find module './prospect-enrich'

- [ ] **Step 4: Implement prospect-enrich.ts**

```typescript
// packages/services/src/prospect-enrich.ts
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
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const res = await fetchFn(url.includes("://") ? url : `https://${url}`, {
      signal: controller.signal,
      headers: { "user-agent": "Mozilla/5.0 (compatible; RhinoBrain/1.0)" },
    });
    clearTimeout(timer);
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @rhino/services exec vitest run src/prospect-enrich.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Export from index.ts** — add:

```typescript
export { askClaudeJson } from "./claude-json";
export { fetchSiteText, extractEnrichment, type Enrichment } from "./prospect-enrich";
```

- [ ] **Step 7: Commit**

```bash
git add packages/services/src/claude-json.ts packages/services/src/prospect-enrich.ts packages/services/src/prospect-enrich.test.ts packages/services/src/index.ts
git commit -m "feat(prospecting): website enrichment via Claude JSON extraction"
```

---

### Task 7: Google Places collector

**Files:**
- Create: `packages/services/src/places-collector.ts`
- Test: `packages/services/src/places-collector.test.ts`

**Interfaces:**
- Produces: `type PlaceCandidate = { companyName: string; phone: string | null; website: string | null; city: string | null; state: string | null; rating: number | null; ratingCount: number | null }`; `searchPlacesPage(opts: { query: string; apiKey: string; pageToken?: string; fetchFn?: typeof fetch }): Promise<{ candidates: PlaceCandidate[]; nextPageToken: string | null }>`; `PLACES_COST_PER_CALL_USD = 0.032` (Text Search Pro SKU est. — used by SourceRun ledger).
- P4-first search queries live in the orchestrator (Task 9), not here.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/services/src/places-collector.test.ts
import { describe, expect, it } from "vitest";
import { searchPlacesPage } from "./places-collector";

const page = {
  places: [
    {
      displayName: { text: "Lone Star Commercial Tire" },
      nationalPhoneNumber: "(214) 555-0100",
      websiteUri: "https://lonestarcommercialtire.com/",
      formattedAddress: "1200 Industrial Blvd, Dallas, TX 75207, USA",
      rating: 4.6,
      userRatingCount: 87,
      addressComponents: [
        { shortText: "Dallas", types: ["locality"] },
        { shortText: "TX", types: ["administrative_area_level_1"] },
      ],
    },
  ],
  nextPageToken: "tok123",
};

describe("searchPlacesPage", () => {
  it("maps API places to candidates and passes the field mask", async () => {
    let captured: RequestInit | undefined;
    const fakeFetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      captured = init;
      return new Response(JSON.stringify(page), { status: 200 });
    }) as typeof fetch;

    const r = await searchPlacesPage({ query: "commercial tire dealer in Texas", apiKey: "k", fetchFn: fakeFetch });
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0]).toMatchObject({ companyName: "Lone Star Commercial Tire", state: "TX", city: "Dallas" });
    expect(r.nextPageToken).toBe("tok123");
    expect((captured?.headers as Record<string, string>)["X-Goog-FieldMask"]).toContain("places.websiteUri");
  });
  it("throws a readable error on non-200", async () => {
    const fakeFetch = (async () => new Response("quota", { status: 429 })) as typeof fetch;
    await expect(searchPlacesPage({ query: "q", apiKey: "k", fetchFn: fakeFetch })).rejects.toThrow(/429/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rhino/services exec vitest run src/places-collector.test.ts`
Expected: FAIL — Cannot find module './places-collector'

- [ ] **Step 3: Implement**

```typescript
// packages/services/src/places-collector.ts
/**
 * Google Places API (New) Text Search. One call = one page (<=20 places).
 * Docs: https://developers.google.com/maps/documentation/places/web-service/text-search
 */
export type PlaceCandidate = {
  companyName: string;
  phone: string | null;
  website: string | null;
  city: string | null;
  state: string | null;
  rating: number | null;
  ratingCount: number | null;
};

export const PLACES_COST_PER_CALL_USD = 0.032;

type ApiPlace = {
  displayName?: { text?: string };
  nationalPhoneNumber?: string;
  websiteUri?: string;
  formattedAddress?: string;
  rating?: number;
  userRatingCount?: number;
  addressComponents?: Array<{ shortText?: string; types?: string[] }>;
};

export async function searchPlacesPage(opts: {
  query: string;
  apiKey: string;
  pageToken?: string;
  fetchFn?: typeof fetch;
}): Promise<{ candidates: PlaceCandidate[]; nextPageToken: string | null }> {
  const f = opts.fetchFn ?? fetch;
  const res = await f("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Goog-Api-Key": opts.apiKey,
      "X-Goog-FieldMask":
        "places.displayName,places.nationalPhoneNumber,places.websiteUri,places.formattedAddress,places.rating,places.userRatingCount,places.addressComponents,nextPageToken",
    },
    body: JSON.stringify({ textQuery: opts.query, pageSize: 20, ...(opts.pageToken ? { pageToken: opts.pageToken } : {}) }),
  });
  if (!res.ok) throw new Error(`Places API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as { places?: ApiPlace[]; nextPageToken?: string };
  const comp = (p: ApiPlace, type: string) =>
    p.addressComponents?.find((c) => c.types?.includes(type))?.shortText ?? null;
  return {
    candidates: (body.places ?? []).map((p) => ({
      companyName: p.displayName?.text ?? "",
      phone: p.nationalPhoneNumber ?? null,
      website: p.websiteUri ?? null,
      city: comp(p, "locality"),
      state: comp(p, "administrative_area_level_1"),
      rating: p.rating ?? null,
      ratingCount: p.userRatingCount ?? null,
    })).filter((c) => c.companyName),
    nextPageToken: body.nextPageToken ?? null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rhino/services exec vitest run src/places-collector.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Export from index.ts** — add:

```typescript
export { searchPlacesPage, PLACES_COST_PER_CALL_USD, type PlaceCandidate } from "./places-collector";
```

- [ ] **Step 6: Commit**

```bash
git add packages/services/src/places-collector.ts packages/services/src/places-collector.test.ts packages/services/src/index.ts
git commit -m "feat(prospecting): Google Places text-search collector"
```

---

### Task 8: Six-check scoring + state assignment

**Files:**
- Create: `packages/services/src/prospect-score.ts`
- Test: `packages/services/src/prospect-score.test.ts`

**Interfaces:**
- Consumes: `askClaudeJson` from `./claude-json`, `Enrichment` from `./prospect-enrich`
- Produces:
  - `type SixCheck = { check: string; pass: boolean; evidence: string }`
  - `type ProspectVerdict = { pool: "A_BUYER" | "B_PROJECT" | "C_CHANNEL" | "D_EXCLUDED"; confidence: "H" | "M" | "L"; productLine: "P1_TRAILER_TIRE" | "P2_TRAILER_WHEEL" | "P3_PCR" | "P4_TBR" | "P5_OTR"; score: number; checks: SixCheck[] }`
  - `scoreProspect(input: { companyName: string; state: string | null; enrichment: Enrichment }, ask?: typeof askClaudeJson): Promise<{ verdict: ProspectVerdict; inputTokens: number; outputTokens: number }>` — clamps/validates model output; invalid → pool C_CHANNEL, confidence L, score 0.
  - `RHINO_STATES: string[]`, `EVERFLOW_STATES: string[]`, `assignStateLocation(state: string | null): "RHINO" | "EVERFLOW" | null` — **state lists are an owner-reviewable business rule, keep them as two exported consts at the top of the file.**

- [ ] **Step 1: Write the failing test**

```typescript
// packages/services/src/prospect-score.test.ts
import { describe, expect, it } from "vitest";
import { assignStateLocation, scoreProspect } from "./prospect-score";

describe("assignStateLocation", () => {
  it("routes southeast to RHINO and south-central to EVERFLOW", () => {
    expect(assignStateLocation("FL")).toBe("RHINO");
    expect(assignStateLocation("GA")).toBe("RHINO");
    expect(assignStateLocation("TX")).toBe("EVERFLOW");
    expect(assignStateLocation("OK")).toBe("EVERFLOW");
  });
  it("returns null for other/unknown states (owner assigns manually)", () => {
    expect(assignStateLocation("CA")).toBeNull();
    expect(assignStateLocation(null)).toBeNull();
  });
});

const enrichment = {
  emails: ["buyer@x.com"], brandsSold: ["Sailun"], sellsWholesale: true,
  businessSummary: "Commercial tire distributor.", buyerSignals: ["dealer portal"],
};

describe("scoreProspect", () => {
  it("passes through a valid verdict", async () => {
    const ask = (async () => ({
      json: {
        pool: "A_BUYER", confidence: "H", productLine: "P4_TBR", score: 86,
        checks: [{ check: "real entity", pass: true, evidence: "has website + locations" }],
      },
      inputTokens: 900, outputTokens: 200,
    })) as never;
    const r = await scoreProspect({ companyName: "X", state: "TX", enrichment }, ask);
    expect(r.verdict.pool).toBe("A_BUYER");
    expect(r.verdict.score).toBe(86);
  });
  it("degrades an invalid payload to C/L/0 instead of throwing", async () => {
    const ask = (async () => ({ json: { pool: "WHATEVER", score: "high" }, inputTokens: 1, outputTokens: 1 })) as never;
    const r = await scoreProspect({ companyName: "X", state: null, enrichment }, ask);
    expect(r.verdict).toMatchObject({ pool: "C_CHANNEL", confidence: "L", score: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rhino/services exec vitest run src/prospect-score.test.ts`
Expected: FAIL — Cannot find module './prospect-score'

- [ ] **Step 3: Implement**

```typescript
// packages/services/src/prospect-score.ts
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
    LINES.includes(o.productLine as never) && typeof o.score === "number";
  const checks: SixCheck[] = Array.isArray(o.checks)
    ? (o.checks as SixCheck[]).filter((c) => c && typeof c.check === "string" && typeof c.pass === "boolean")
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @rhino/services exec vitest run src/prospect-score.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Export from index.ts** — add:

```typescript
export { scoreProspect, assignStateLocation, RHINO_STATES, EVERFLOW_STATES, type ProspectVerdict, type SixCheck } from "./prospect-score";
```

- [ ] **Step 6: Run the full services suite** (regression)

Run: `pnpm --filter @rhino/services test`
Expected: all suites PASS

- [ ] **Step 7: Commit**

```bash
git add packages/services/src/prospect-score.ts packages/services/src/prospect-score.test.ts packages/services/src/index.ts
git commit -m "feat(prospecting): six-check AI scoring + warehouse state assignment"
```

---

### Task 9: Orchestrator script `run-prospecting.ts`

**Files:**
- Create: `packages/database/scripts/run-prospecting.ts`

**Interfaces:**
- Consumes: `searchPlacesPage`, `PLACES_COST_PER_CALL_USD`, `dedupeKeyFor`, `matchesExclusion`, `fetchSiteText`, `extractEnrichment`, `scoreProspect`, `assignStateLocation` (imported from `../../services/src/...` directly, like other scripts).
- Produces: CLI `pnpm --filter @rhino/database exec tsx scripts/run-prospecting.ts --state TX --category p4 --limit 40 [--dry]`. Creates SourceRun (GOOGLE_PLACES) with cost ledger; creates Leads (source PROSPECTING, unreviewed) with enrichment + verdict; maps location by `assignStateLocation` → `db.location.findFirst({ where: { shortTag } })`.

- [ ] **Step 1: Write the script**

```typescript
// packages/database/scripts/run-prospecting.ts
/**
 * Prospecting pipeline: Places sweep → exclusion filter → dedupe → enrich →
 * six-check score → Lead rows awaiting calibration in the CRM.
 *
 *   pnpm --filter @rhino/database exec tsx scripts/run-prospecting.ts --state TX --category p4 --limit 40
 *   --category p4|p3|p1  (P4 truck first — owner priority)
 *   --dry                collect + filter only, no AI, no writes
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { searchPlacesPage, PLACES_COST_PER_CALL_USD } from "../../services/src/places-collector";
import { dedupeKeyFor } from "../../services/src/prospect-dedupe";
import { matchesExclusion } from "../../services/src/exclusion-service";
import { fetchSiteText, extractEnrichment } from "../../services/src/prospect-enrich";
import { scoreProspect, assignStateLocation } from "../../services/src/prospect-score";

const db = new PrismaClient();

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}
const DRY = process.argv.includes("--dry");
const STATE = (arg("state") ?? "").toUpperCase();
const CATEGORY = arg("category", "p4")!;
const LIMIT = Number(arg("limit", "40"));

// Search queries per product line (spec §7). P4 first.
const QUERIES: Record<string, string[]> = {
  p4: ["commercial truck tire dealer", "truck tire shop", "truck repair shop", "trucking company", "fleet services"],
  p3: ["tire wholesaler", "tire shop", "used and new tire dealer"],
  p1: ["trailer parts distributor", "trailer tires wholesale", "trailer manufacturer"],
};
const STATE_NAMES: Record<string, string> = {
  FL: "Florida", TX: "Texas", GA: "Georgia", AL: "Alabama", SC: "South Carolina", NC: "North Carolina",
  TN: "Tennessee", MS: "Mississippi", OK: "Oklahoma", LA: "Louisiana", AR: "Arkansas", NM: "New Mexico",
};

// same env fallback as ai-propose-specs.ts — Prisma loads .env for its own use
function ensureEnv(name: string) {
  if (process.env[name]) return;
  try {
    const env = readFileSync(join(__dirname, "..", ".env"), "utf8");
    const m = env.match(new RegExp(`^${name}="?([^"\\n]+)"?`, "m"));
    if (m) process.env[name] = m[1];
  } catch { /* fall through to the explicit check below */ }
}

async function main() {
  if (!STATE || !STATE_NAMES[STATE]) throw new Error(`--state must be one of: ${Object.keys(STATE_NAMES).join(", ")}`);
  if (!QUERIES[CATEGORY]) throw new Error(`--category must be one of: ${Object.keys(QUERIES).join(", ")}`);
  ensureEnv("GOOGLE_PLACES_API_KEY");
  ensureEnv("ANTHROPIC_API_KEY");
  const placesKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!placesKey) throw new Error("GOOGLE_PLACES_API_KEY not set");

  const exclusions = await db.exclusionList.findMany({ select: { kind: true, companyName: true, domain: true, phone: true } });
  const locByTag = async (tag: "FL" | "TX") => (await db.location.findFirst({ where: { shortTag: tag } }))?.id ?? null;
  const rhinoId = await locByTag("FL");
  const everflowId = await locByTag("TX");

  let apiCalls = 0, inTok = 0, outTok = 0, results = 0, created = 0, dups = 0, excluded = 0;
  const run = DRY ? null : await db.sourceRun.create({
    data: { source: "GOOGLE_PLACES", params: { state: STATE, category: CATEGORY, limit: LIMIT } },
  });

  outer:
  for (const q of QUERIES[CATEGORY]) {
    let pageToken: string | undefined;
    do {
      const page = await searchPlacesPage({ query: `${q} in ${STATE_NAMES[STATE]}`, apiKey: placesKey, pageToken });
      apiCalls++;
      pageToken = page.nextPageToken ?? undefined;
      for (const c of page.candidates) {
        if (results >= LIMIT) break outer;
        results++;
        if (matchesExclusion({ companyName: c.companyName, website: c.website, phone: c.phone }, exclusions)) { excluded++; continue; }
        const key = dedupeKeyFor({ website: c.website, phone: c.phone, companyName: c.companyName, city: c.city });
        if (!key) continue;
        if (await db.lead.findFirst({ where: { dedupeKey: key }, select: { id: true } })) { dups++; continue; }
        if (DRY) { console.log("would create:", c.companyName, c.city, c.state); continue; }

        const siteText = c.website ? await fetchSiteText(c.website) : "";
        const enr = await extractEnrichment(siteText, c.companyName);
        const sc = await scoreProspect({ companyName: c.companyName, state: c.state, enrichment: enr.enrichment });
        inTok += enr.inputTokens + sc.inputTokens;
        outTok += enr.outputTokens + sc.outputTokens;
        const wh = assignStateLocation(c.state);
        await db.lead.create({
          data: {
            companyName: c.companyName,
            phone: c.phone, city: c.city, state: c.state,
            email: enr.enrichment.emails[0] ?? null,
            type: "WHOLESALE_DEALER",
            source: "PROSPECTING",
            interest: sc.verdict.productLine === "P3_PCR" ? "PCR_TIRES" : sc.verdict.productLine === "P4_TBR" ? "TBR_TIRES" : sc.verdict.productLine === "P2_TRAILER_WHEEL" ? "WHEELS" : "TRAILER_TIRES",
            stage: "NEW_LEAD",
            pool: sc.verdict.pool, confidence: sc.verdict.confidence, productLine: sc.verdict.productLine,
            score: sc.verdict.score, scoreReasons: sc.verdict.checks,
            enrichment: enr.enrichment as object,
            dedupeKey: key, sourceRunId: run!.id,
            locationId: wh === "RHINO" ? rhinoId : wh === "EVERFLOW" ? everflowId : null,
            meta: { website: c.website, rating: c.rating, ratingCount: c.ratingCount, placesQuery: q },
          },
        });
        created++;
        console.log(`+ ${c.companyName} [${sc.verdict.pool}/${sc.verdict.confidence}] score=${sc.verdict.score}`);
      }
    } while (pageToken && results < LIMIT);
  }

  if (run) {
    await db.sourceRun.update({
      where: { id: run.id },
      data: {
        resultCount: results, newLeadCount: created, dupCount: dups, excludedCount: excluded,
        apiCostUsd: apiCalls * PLACES_COST_PER_CALL_USD, inputTokens: inTok, outputTokens: outTok,
      },
    });
  }
  console.log({ results, created, dups, excluded, apiCalls, inTok, outTok });
}

main().finally(() => db.$disconnect());
```

- [ ] **Step 2: Dry run** (needs `GOOGLE_PLACES_API_KEY` in `packages/database/.env`; if key not yet purchased, verify arg validation only: run without `--state` and expect the readable error)

Run: `pnpm --filter @rhino/database exec tsx scripts/run-prospecting.ts --state TX --category p4 --limit 5 --dry`
Expected: 5 `would create:` lines, summary object, no DB writes (SourceRun count unchanged).

- [ ] **Step 3: Small real run** (only if both API keys present)

Run: `pnpm --filter @rhino/database exec tsx scripts/run-prospecting.ts --state TX --category p4 --limit 5`
Expected: up to 5 `+ Company [POOL/CONF] score=NN` lines; SourceRun row with cost fields > 0.

- [ ] **Step 4: Commit**

```bash
git add packages/database/scripts/run-prospecting.ts
git commit -m "feat(prospecting): pipeline orchestrator — collect, filter, enrich, score"
```

---

### Task 10: CRM calibration queue

**Files:**
- Create: `apps/rhino-brain/src/actions/prospecting.ts`
- Create: `apps/rhino-brain/src/components/prospect-card.tsx`
- Create: `apps/rhino-brain/src/app/(app)/prospecting/page.tsx`

**Interfaces:**
- Consumes: `requireManager` from `@/lib/auth`; `db` from `@/lib/db`; `addExclusion` from `@rhino/services`.
- Produces: page `/prospecting` (manager-only). Server actions: `calibrateLead(leadId: string, verdict: "FOLLOW" | "REJECT", opts?: { repId?: string; reason?: string; alsoExclude?: boolean }): Promise<{ ok: boolean; error?: string }>` and reps list loader. Nav entry added to the sidebar the same way existing pages register (check `apps/rhino-brain/src/app/(app)/layout.tsx` nav array and add `{ href: "/prospecting", label: "Prospecting" }` in the managers-only group, mirroring how `/spec-review` is gated).

- [ ] **Step 1: Server actions**

```typescript
// apps/rhino-brain/src/actions/prospecting.ts
"use server";

import { revalidatePath } from "next/cache";
import { addExclusion } from "@rhino/services";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/auth";

/** Calibration queue verdicts (spec §6.2). FOLLOW keeps the AI grade and
 * optionally assigns a rep; REJECT moves the lead to pool D and (optionally)
 * writes an ExclusionList rule so collectors never resurface the company. */
export async function calibrateLead(
  leadId: string,
  verdict: "FOLLOW" | "REJECT",
  opts?: { repId?: string; reason?: string; alsoExclude?: boolean }
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireManager();
  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead) return { ok: false, error: "Lead not found" };
  if (lead.reviewedAt) return { ok: false, error: "Already reviewed" };

  if (verdict === "FOLLOW") {
    await db.lead.update({
      where: { id: leadId },
      data: {
        reviewedAt: new Date(),
        reviewedById: session.userId,
        ...(opts?.repId ? { assignedRepId: opts.repId } : {}),
      },
    });
  } else {
    if (!opts?.reason) return { ok: false, error: "Reject needs a reason" };
    await db.lead.update({
      where: { id: leadId },
      data: { reviewedAt: new Date(), reviewedById: session.userId, pool: "D_EXCLUDED", rejectReason: opts.reason },
    });
    if (opts.alsoExclude) {
      const meta = (lead.meta ?? {}) as { website?: string };
      await addExclusion({
        kind: "RISK",
        companyName: lead.companyName,
        website: meta.website,
        phone: lead.phone,
        reason: `calibration reject: ${opts.reason}`,
        addedById: session.userId,
      });
    }
  }
  revalidatePath("/prospecting");
  return { ok: true };
}

export async function listRepsForAssign(): Promise<Array<{ id: string; name: string }>> {
  await requireManager();
  const reps = await db.user.findMany({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return reps;
}
```

(If `User` has no `active` field, drop the `where` — check `model User` when implementing.)

- [ ] **Step 2: Card component** (client component, mirrors `spec-proposal-card.tsx` style — read that file first and match its Tailwind idioms)

```tsx
// apps/rhino-brain/src/components/prospect-card.tsx
"use client";

import { useState, useTransition } from "react";
import { calibrateLead } from "@/actions/prospecting";

type Check = { check: string; pass: boolean; evidence: string };
type Props = {
  lead: {
    id: string; companyName: string; city: string | null; state: string | null;
    pool: string | null; confidence: string | null; productLine: string | null; score: number | null;
    email: string | null; phone: string | null;
    scoreReasons: Check[] | null;
    enrichment: { businessSummary?: string; brandsSold?: string[]; buyerSignals?: string[]; emails?: string[] } | null;
    meta: { website?: string; angle?: string } | null;
  };
  reps: Array<{ id: string; name: string }>;
};

const POOL_COLORS: Record<string, string> = {
  A_BUYER: "bg-emerald-100 text-emerald-800",
  B_PROJECT: "bg-blue-100 text-blue-800",
  C_CHANNEL: "bg-amber-100 text-amber-800",
  D_EXCLUDED: "bg-slate-200 text-slate-600",
};

export function ProspectCard({ lead, reps }: Props) {
  const [pending, start] = useTransition();
  const [repId, setRepId] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [alsoExclude, setAlsoExclude] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const act = (verdict: "FOLLOW" | "REJECT") =>
    start(async () => {
      const r = await calibrateLead(lead.id, verdict, { repId: repId || undefined, reason, alsoExclude });
      if (!r.ok) setError(r.error ?? "failed");
      else setDone(true);
    });

  if (done) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${POOL_COLORS[lead.pool ?? ""] ?? "bg-slate-100"}`}>
          {lead.pool ?? "?"}/{lead.confidence ?? "?"}
        </span>
        <span className="text-xs font-semibold text-slate-500">{lead.productLine ?? "—"}</span>
        <span className="text-xs text-slate-400">score {lead.score ?? "—"}</span>
        <h3 className="w-full text-base font-bold">
          {lead.companyName}
          <span className="ml-2 text-sm font-normal text-slate-400">{[lead.city, lead.state].filter(Boolean).join(", ")}</span>
        </h3>
      </div>

      {lead.meta?.website && (
        <a href={lead.meta.website.startsWith("http") ? lead.meta.website : `https://${lead.meta.website}`} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline">
          {lead.meta.website}
        </a>
      )}
      {lead.enrichment?.businessSummary && <p className="text-sm text-slate-600">{lead.enrichment.businessSummary}</p>}
      {lead.meta?.angle && <p className="rounded bg-amber-50 p-2 text-sm text-amber-900">Angle: {lead.meta.angle}</p>}
      {!!lead.enrichment?.brandsSold?.length && (
        <p className="text-xs text-slate-500">Brands: {lead.enrichment.brandsSold.join(", ")}</p>
      )}
      {!!lead.scoreReasons?.length && (
        <ul className="space-y-0.5 text-xs">
          {lead.scoreReasons.map((c, i) => (
            <li key={i} className={c.pass ? "text-emerald-700" : "text-red-600"}>
              {c.pass ? "✓" : "✗"} {c.check}: {c.evidence}
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {rejecting ? (
        <div className="space-y-2">
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reject reason (required — feeds exclusion rules)" className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={alsoExclude} onChange={(e) => setAlsoExclude(e.target.checked)} />
            Also add to protection list (collectors will never surface this company again)
          </label>
          <div className="flex gap-2">
            <button disabled={pending || !reason} onClick={() => act("REJECT")} className="rounded bg-red-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">Confirm reject</button>
            <button onClick={() => setRejecting(false)} className="rounded border px-3 py-1.5 text-sm">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button disabled={pending} onClick={() => act("FOLLOW")} className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">Follow up</button>
          <select value={repId} onChange={(e) => setRepId(e.target.value)} className="rounded border border-slate-300 px-2 py-1.5 text-sm">
            <option value="">Assign rep (optional)</option>
            {reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <button disabled={pending} onClick={() => setRejecting(true)} className="rounded border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-600">Not a target</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Page**

```tsx
// apps/rhino-brain/src/app/(app)/prospecting/page.tsx
import { db } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { listRepsForAssign } from "@/actions/prospecting";
import { ProspectCard } from "@/components/prospect-card";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

/** Prospect calibration queue (spec §6.2). AI-graded leads wait here for a
 * human verdict before any outreach can ever target them. */
export default async function ProspectingPage() {
  await requireManager();

  const [pendingCount, followedCount, rejectedCount, poolCounts, pending, reps, runs] = await Promise.all([
    db.lead.count({ where: { source: "PROSPECTING", reviewedAt: null } }),
    db.lead.count({ where: { source: "PROSPECTING", reviewedAt: { not: null }, pool: { not: "D_EXCLUDED" } } }),
    db.lead.count({ where: { source: "PROSPECTING", pool: "D_EXCLUDED" } }),
    db.lead.groupBy({ by: ["pool"], where: { source: "PROSPECTING" }, _count: true }),
    db.lead.findMany({
      where: { source: "PROSPECTING", reviewedAt: null },
      orderBy: [{ score: { sort: "desc", nulls: "last" } }, { createdAt: "asc" }],
      take: PAGE_SIZE,
    }),
    listRepsForAssign(),
    db.sourceRun.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">
          Prospecting <span className="text-sm font-normal text-slate-400">(AI-graded leads awaiting calibration)</span>
        </h1>
        <div className="flex gap-3 text-sm text-slate-500">
          <span>Pending <b>{pendingCount}</b></span>
          <span>Followed <b className="text-emerald-700">{followedCount}</b></span>
          <span>Rejected <b className="text-red-600">{rejectedCount}</b></span>
          {poolCounts.map((p) => <span key={p.pool ?? "null"}>{p.pool ?? "unscored"} <b>{p._count}</b></span>)}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
        Recent runs:{" "}
        {runs.map((r) => (
          <span key={r.id} className="mr-3">
            {r.source} +{r.newLeadCount} new / {r.dupCount} dup / {r.excludedCount} protected · ${r.apiCostUsd.toFixed(2)} + {r.inputTokens + r.outputTokens} tok
          </span>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {pending.map((lead) => (
          <ProspectCard
            key={lead.id}
            reps={reps}
            lead={{
              id: lead.id, companyName: lead.companyName, city: lead.city, state: lead.state,
              pool: lead.pool, confidence: lead.confidence, productLine: lead.productLine, score: lead.score,
              email: lead.email, phone: lead.phone,
              scoreReasons: (lead.scoreReasons as never) ?? null,
              enrichment: (lead.enrichment as never) ?? null,
              meta: (lead.meta as never) ?? null,
            }}
          />
        ))}
        {pending.length === 0 && <p className="text-sm text-slate-400">Queue is empty — run the collector script to bring in more prospects.</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add nav entry** — open `apps/rhino-brain/src/app/(app)/layout.tsx`, find how `/spec-review` is added to the nav (including its manager gating), and add `Prospecting → /prospecting` beside it, same gating.

- [ ] **Step 5: Verify in the browser** (preview_start the CRM dev server per `.claude/launch.json`, or `pnpm --filter rhino-brain dev` config if none):
  - `/prospecting` as manager → seed cards visible, ordered by score
  - Click **Follow up** on one card → card disappears, Followed count +1
  - Click **Not a target** without reason → Confirm disabled; with reason + "Also add to protection" → card disappears, ExclusionList gains a row
  - Rep (non-manager) login → `/prospecting` denied

- [ ] **Step 6: Typecheck + full test regression**

Run: `pnpm --filter rhino-brain exec tsc --noEmit && pnpm --filter @rhino/services test`
Expected: both clean

- [ ] **Step 7: Commit**

```bash
git add apps/rhino-brain/src/actions/prospecting.ts apps/rhino-brain/src/components/prospect-card.tsx "apps/rhino-brain/src/app/(app)/prospecting" "apps/rhino-brain/src/app/(app)/layout.tsx"
git commit -m "feat(prospecting): calibration queue page — follow/assign/reject with exclusion feedback"
```

---

## Out of scope (next plan: Outreach Engine)

ProspectCampaign/OutreachMessage/Mailbox models, AI email + phone-script drafts, Gmail API sending with warmup/caps, reply detection, unsubscribe endpoint, outbox UI, five-way dashboard. The exclusion gate (`isExcluded`) and the `reviewedAt` calibration built here are its hard prerequisites.
