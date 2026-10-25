# Dealer List Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a 5,064-dealer multi-brand wheel-locator list into tiered, territory-routed, rep-assignable leads inside Rhino Brain — without burying the daily prospecting drip or cold-calling existing customers.

**Architecture:** A parse → reconcile → import → release pipeline that reuses the existing prospecting machinery (`dedupeKeyFor`, `isExcluded`, `findBlacklistMatch`, `assignStateLocation`, the `/prospecting` queue, the atomic Claim flow). Two new pure services (workbook parsing, tier ranking) plus two scripts (read-only reconciliation, gated importer). No second lead pipeline is built.

**Tech Stack:** TypeScript, Prisma/PostgreSQL, Next.js server actions, ExcelJS, vitest.

**Spec:** `docs/superpowers/specs/2026-10-24-dealer-list-activation-design.md`

## Global Constraints

- Source workbook: `OneDrive\Documents\RHINO BRAIN WHEEL CUSTOMER\Dealer-Locators-2026-10-23.xlsx`, sheets `KG1 FORGED`, `AMERICAN FORCE`, `FUEL OFF-ROAD`, `JTX FORGED`, `GOLF CART (STEELENG)`. Columns in order: State, City, Dealer Name, Street Address, Zip, Country, Phone, Email, Website.
- **Never trust the Country column** (spec §2.2b): `USAA` appears on 1,594 rows, and some rows hold a ZIP or phone. Territory routing keys off State only, via the existing `assignStateLocation(state)`.
- Territory constants are the existing exported `RHINO_STATES = ["FL","GA","AL","SC","NC","TN","MS"]` and `EVERFLOW_STATES = ["TX","OK","LA","AR","NM"]` in `packages/services/src/prospect-score.ts`. Do not redefine them.
- `dedupeKeyFor` returns `""` for non-dedupable input. `""` must never be written to `Lead.dedupeKey` (it is `@unique`).
- Non-home US states get `locationId = null` and **must not surface in any rep queue** (spec §8.1).
- Canada and international rows are imported for the record but parked — never released to a rep.
- Every write path runs `isExcluded()` and `findBlacklistMatch()` before creating anything rep-visible.
- Tests: vitest. Run from `packages/services` with `npm test`, or a single file with `npx vitest run src/<file>.test.ts`.
- Reps are location-scoped (`company-isolation-rule`); any new query touching Lead/Customer scopes by `locationId`.

## Review Focus

Five failure modes the spec implies that no happy-path test would catch. Each has a test assigned to the task that owns the code.

1. **Non-dedupable row** — a dealer with no usable phone and a too-short name writes `""` into the unique `dedupeKey` and the second such row explodes on insert. *(Task 6)*
2. **Corrupt Country value** — a row whose Country is `USAA`, a ZIP, or a phone number must still route correctly off State, and must never be classified international. *(Task 2)*
3. **Blacklisted dealer reaching a human** — a `BLACKLIST` match must be blocked on **both** paths, the prospecting path *and* the existing-customer cross-sell path. *(Tasks 6 and 7)*
4. **Same dealer spelled differently across brand sheets** — must merge into one record with a 2-brand count, not import twice with 1 each. *(Task 2)*
5. **Re-running the importer** — must be idempotent: no duplicate Leads, and an already-claimed lead must keep its `assignedRepId`. *(Task 6)*

---

## File Structure

**Create**
- `packages/services/src/dealer-list-parse.ts` — workbook → deduped `DealerRecord[]` with brand sets
- `packages/services/src/dealer-list-parse.test.ts`
- `packages/services/src/dealer-tier.ts` — pure tier ranking
- `packages/services/src/dealer-tier.test.ts`
- `packages/services/src/website-resolve.ts` — Places lookup filling the 99.9% website gap
- `packages/services/src/website-resolve.test.ts`
- `packages/database/scripts/reconcile-dealers.ts` — Phase 0, read-only
- `packages/database/scripts/import-dealers.ts` — gated importer

**Modify**
- `packages/database/prisma/schema.prisma` — three `CustomerType` values
- `apps/rhino-brain/src/actions/my-prospects.ts` — tier-ordered release
- `apps/rhino-brain/src/app/(app)/customers/page.tsx` — type + city/state filters

---

### Task 1: Customer classification

**Files:**
- Modify: `packages/database/prisma/schema.prisma` (`enum CustomerType`)
- Create: migration via `npx prisma migrate dev --name add_wheel_truck_atv_customer_types`

**Interfaces:**
- Produces: `CustomerType.WHEEL_SHOP`, `CustomerType.TRUCK_TIRE_SHOP`, `CustomerType.ATV_GOLF`

- [ ] **Step 1: Add the three values** to `enum CustomerType`, after `TIRE_SHOP`. Additive only — do not reorder or remove existing values.
- [ ] **Step 2: Generate the migration**

Run: `cd packages/database && npx prisma migrate dev --name add_wheel_truck_atv_customer_types`
Expected: migration created, `prisma generate` succeeds.

- [ ] **Step 3: Verify no existing row changed**

Run: `npx prisma studio` or a count query grouping `Customer` by `type`.
Expected: the pre-migration distribution is unchanged; the three new values have 0 rows.

- [ ] **Step 4: Commit**

```bash
git add packages/database/prisma
git commit -m "feat: add WHEEL_SHOP, TRUCK_TIRE_SHOP, ATV_GOLF customer types"
```

---

### Task 2: Workbook parser

Reads the five brand sheets, normalises, and merges the same dealer across sheets into one record carrying a brand set.

**Files:**
- Create: `packages/services/src/dealer-list-parse.ts`
- Test: `packages/services/src/dealer-list-parse.test.ts`

**Interfaces:**
- Consumes: `dedupeKeyFor` from `./prospect-dedupe`
- Produces:
```ts
export type DealerRecord = {
  name: string; street: string; city: string; state: string; zip: string;
  phone: string; email: string; website: string;
  brands: string[];           // sorted, deduped
  country: "US" | "CA" | "OTHER";   // derived from STATE, never from the Country column
  dedupeKey: string;          // "" when not dedupable
};
export function mergeDealerRows(rows: RawDealerRow[]): DealerRecord[];
export async function parseDealerWorkbook(path: string): Promise<DealerRecord[]>;
```
`RawDealerRow` is the 9 sheet columns as strings plus `brand: string`.

- [ ] **Step 1: Write the failing tests**

```ts
describe("mergeDealerRows", () => {
  it("merges the same dealer across sheets by phone into one record with both brands", () => {
    const out = mergeDealerRows([
      { brand: "KG1 FORGED", name: "WHEEL SPECIALISTS, INC.", city: "Tempe", state: "AZ", phone: "480-968-1314", street: "", zip: "", country: "USA", email: "", website: "" },
      { brand: "FUEL OFF-ROAD", name: "Wheel Specialists Inc", city: "TEMPE", state: "AZ", phone: "(480) 968-1314", street: "", zip: "", country: "USAA", email: "a@b.com", website: "" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].brands).toEqual(["FUEL OFF-ROAD", "KG1 FORGED"]);
    expect(out[0].email).toBe("a@b.com"); // first non-empty wins
  });

  it("derives country from STATE and ignores a corrupt Country column", () => {
    const out = mergeDealerRows([
      { brand: "KG1 FORGED", name: "A Shop", city: "Dallas", state: "TX", phone: "2145551212", street: "", zip: "", country: "USAA", email: "", website: "" },
      { brand: "KG1 FORGED", name: "B Shop", city: "Calgary", state: "AB", phone: "4035551212", street: "", zip: "", country: "76013", email: "", website: "" },
    ]);
    expect(out.find(r => r.name === "A Shop")!.country).toBe("US");
    expect(out.find(r => r.name === "B Shop")!.country).toBe("CA");
  });

  it("marks a row with no phone and a short name as non-dedupable", () => {
    const out = mergeDealerRows([
      { brand: "KG1 FORGED", name: "ABC", city: "", state: "TX", phone: "", street: "", zip: "", country: "", email: "", website: "" },
    ]);
    expect(out[0].dedupeKey).toBe("");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/services && npx vitest run src/dealer-list-parse.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `mergeDealerRows` and `parseDealerWorkbook`**

Merge key: `dedupeKeyFor({ phone, companyName: name, city })`; when it returns `""` the row is kept as its own record and flagged non-dedupable. Country: US state code → `"US"`, Canadian province code → `"CA"`, else `"OTHER"`. Field fill: first non-empty value across merged rows wins. `parseDealerWorkbook` reads with ExcelJS, skips row 1 of each sheet, tags each row with its sheet name as `brand`, then calls `mergeDealerRows`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/dealer-list-parse.test.ts`
Expected: PASS.

- [ ] **Step 5: Sanity-check against the real workbook**

Run a one-off script calling `parseDealerWorkbook` on the real file.
Expected: ~5,064 unique records; brand distribution 4 → 27, 3 → 99, 2 → 776, 1 → 4,162.

- [ ] **Step 6: Commit**

```bash
git add packages/services/src/dealer-list-parse.ts packages/services/src/dealer-list-parse.test.ts
git commit -m "feat: parse and merge multi-brand dealer locator workbook"
```

---

### Task 3: Tier ranking

**Files:**
- Create: `packages/services/src/dealer-tier.ts`
- Test: `packages/services/src/dealer-tier.test.ts`

**Interfaces:**
- Consumes: `assignStateLocation` from `./prospect-score`; `DealerRecord` from `./dealer-list-parse`
- Produces:
```ts
export type Tier = 1|2|3|4|5|6|7|8|9;
export function tierFor(d: DealerRecord, opts?: { milesFromHub?: number | null; isExistingCustomer?: boolean }): Tier;
export function compareForRelease(a: DealerRecord, b: DealerRecord): number;
```

Tier definitions are spec §5 ranks 1–9 verbatim.

- [ ] **Step 1: Write the failing tests**

```ts
it("ranks an existing customer tier 1", () => {
  expect(tierFor(rec({ state: "FL", brands: ["A"] }), { isExistingCustomer: true })).toBe(1);
});
it("ranks a home-state multi-brand dealer tier 2", () => {
  expect(tierFor(rec({ state: "FL", brands: ["A","B"] }))).toBe(2);
});
it("ranks a home-state single-brand dealer near a hub tier 3, far tier 4", () => {
  expect(tierFor(rec({ state: "TX", brands: ["A"] }), { milesFromHub: 90 })).toBe(3);
  expect(tierFor(rec({ state: "TX", brands: ["A"] }), { milesFromHub: 400 })).toBe(4);
});
it("ranks a non-home 3-brand dealer tier 5, above a non-home single-brand", () => {
  expect(tierFor(rec({ state: "CA", brands: ["A","B","C"] }))).toBe(5);
  expect(tierFor(rec({ state: "CA", brands: ["A"] }))).toBe(7);
});
it("parks Canada at tier 8", () => {
  expect(tierFor(rec({ state: "ON", brands: ["A","B"] }))).toBe(8);
});
it("sorts an emailed dealer above an otherwise-identical one without", () => {
  const withEmail = rec({ state: "FL", brands: ["A","B"], email: "x@y.com" });
  const without  = rec({ state: "FL", brands: ["A","B"], email: "" });
  expect(compareForRelease(withEmail, without)).toBeLessThan(0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/dealer-tier.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement `tierFor` and `compareForRelease`**

Pure functions, no DB. `compareForRelease` sorts by tier ascending, then brand count descending, then email-present, then name.

- [ ] **Step 4: Run to verify it passes** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/services/src/dealer-tier.ts packages/services/src/dealer-tier.test.ts
git commit -m "feat: tier ranking for dealer list release order"
```

---

### Task 4: Reconciliation report (Phase 0, read-only)

Answers "how many are actually new" before anything is written or any AI budget is spent.

**Files:**
- Create: `packages/database/scripts/reconcile-dealers.ts`

**Interfaces:**
- Consumes: `parseDealerWorkbook`, `tierFor`, `isExcluded`, `findBlacklistMatch`
- Produces: a CSV + stdout summary. **No writes of any kind.**

- [ ] **Step 1: Implement the script**

`npx tsx scripts/reconcile-dealers.ts --file <path> [--out report.csv]`. For every parsed record, classify into exactly one bucket: `ALREADY_CUSTOMER` (matches `ExclusionList` kind `EXISTING_CUSTOMER`), `BLACKLISTED`, `ALREADY_LEAD` (`Lead.dedupeKey` hit), `NON_DEDUPABLE` (`dedupeKey === ""`), or `NEW`. Report counts by bucket × territory (Rhino / Everflow / other-US / Canada / other) × tier, plus the active `SALES_REP` head-count per location.

- [ ] **Step 2: Run it against the real workbook**

Run: `cd packages/database && npx tsx scripts/reconcile-dealers.ts --file "<path>" --out dealer-reconcile.csv`
Expected: totals sum to the parsed record count; **R** (the `NEW` count) and rep head-count printed.

- [ ] **Step 3: Confirm it wrote nothing**

Run the script twice and diff `SELECT count(*) FROM "Lead"` before and after.
Expected: identical.

- [ ] **Step 4: Commit**

```bash
git add packages/database/scripts/reconcile-dealers.ts
git commit -m "feat: read-only dealer list reconciliation report"
```

> **GATE:** Do not start Task 6 until the owner has seen this report and re-confirmed the §8.5 scope (the 685→1,579 change).

---

### Task 5: Website resolution

Fills the gap from spec §2.2 — 5 of 5,064 rows carry a website, and `prospect-enrich` needs one.

**Files:**
- Create: `packages/services/src/website-resolve.ts`
- Test: `packages/services/src/website-resolve.test.ts`

**Interfaces:**
- Consumes: the Places text-search helper already used by `places-collector.ts`
- Produces:
```ts
export async function resolveWebsite(d: { name: string; city: string; state: string }): Promise<{ website: string | null; confidence: "HIGH" | "LOW" }>;
```

- [ ] **Step 1: Write the failing tests** — mock the Places client:

```ts
it("returns the website when the top hit's name and city both match", async () => { /* expect confidence HIGH */ });
it("returns LOW confidence when only the city matches", async () => { /* … */ });
it("returns null rather than guessing when there are no hits", async () => {
  await expect(resolveWebsite({ name: "Nonexistent", city: "Nowhere", state: "ZZ" }))
    .resolves.toEqual({ website: null, confidence: "LOW" });
});
```

- [ ] **Step 2: Run to verify it fails** — Expected: FAIL.
- [ ] **Step 3: Implement `resolveWebsite`.** Query `"<name>" <city> <state>`. HIGH only when normalised name and city both match the top result; otherwise LOW. Never fabricate a URL.
- [ ] **Step 4: Run to verify it passes** — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add packages/services/src/website-resolve.ts packages/services/src/website-resolve.test.ts
git commit -m "feat: resolve dealer websites via Places for enrichment"
```

---

### Task 6: Gated importer

**Files:**
- Create: `packages/database/scripts/import-dealers.ts` (thin CLI)
- Create: `packages/services/src/dealer-import-rules.ts` (the testable rules)
- Test: `packages/services/src/dealer-import-rules.test.ts`

**Interfaces:**
- Consumes: `parseDealerWorkbook`, `tierFor`, `dedupeKeyFor`, `isExcluded`, `findBlacklistMatch`, `assignStateLocation`
- Produces: `Lead` rows tagged with one `ImportBatch`; `Lead.meta.brands`, `Lead.meta.tier`, `Lead.meta.brandCount`

- [ ] **Step 1: Write the failing tests** (Review Focus 1, 3, 5)

```ts
it("skips a non-dedupable record rather than writing an empty dedupeKey", () => {
  expect(shouldImport({ ...rec, dedupeKey: "" })).toEqual({ ok: false, reason: "NON_DEDUPABLE" });
});
it("blocks a blacklisted dealer from import", () => {
  expect(shouldImport(rec, { blacklisted: true })).toEqual({ ok: false, reason: "BLACKLISTED" });
});
it("gives a non-home US state a null locationId", () => {
  expect(locationForRecord({ ...rec, state: "MT" }, ids)).toBeNull();
});
it("routes home states to their own location", () => {
  expect(locationForRecord({ ...rec, state: "FL" }, ids)).toBe(ids.rhino);
  expect(locationForRecord({ ...rec, state: "TX" }, ids)).toBe(ids.everflow);
});
it("treats an existing dedupeKey as an update that preserves assignedRepId", () => {
  expect(mergeIntoExisting({ assignedRepId: "rep-1" }, rec).assignedRepId).toBe("rep-1");
});
```

- [ ] **Step 2: Run to verify it fails** — Expected: FAIL.

- [ ] **Step 3: Implement the rules in `packages/services/src/dealer-import-rules.ts`**

```ts
export function shouldImport(d: DealerRecord, flags: { blacklisted?: boolean; excluded?: boolean }): { ok: boolean; reason?: string };
export function locationForRecord(d: DealerRecord, ids: { rhino: string|null; everflow: string|null; qingdao: string|null }): string | null;
export function mergeIntoExisting(existing: Pick<Lead,"assignedRepId">, d: DealerRecord): Partial<Lead>;
```
`locationForRecord` delegates to `assignStateLocation(d.state)`; `"OTHER"`/`"CA"` country → qingdao; non-home US → `null`.

- [ ] **Step 4: Run to verify it passes** — Expected: PASS.

- [ ] **Step 5: Implement the script** `import-dealers.ts` with `--file`, `--territory rhino|everflow|all`, `--limit`, `--dry`. Creates one `ImportBatch`, then per record: exclusion check → blacklist check → upsert `Lead` by `dedupeKey` → set `type: WHEEL_SHOP` (or `ATV_GOLF` for the STEELENG sheet), `source: PROSPECTING`, `stage: NEW_LEAD`, `locationId` per the rule, `meta.brands/tier/brandCount`, `importBatchId`.

- [ ] **Step 6: Dry-run, then import one territory**

Run: `npx tsx scripts/import-dealers.ts --file "<path>" --territory rhino --dry`
Expected: counts match the Task 4 report for that territory, zero writes.

- [ ] **Step 7: Prove idempotence**

Run the real import twice; compare `SELECT count(*) FROM "Lead"` and spot-check one claimed lead's `assignedRepId`.
Expected: count unchanged on the second run; `assignedRepId` preserved.

- [ ] **Step 8: Commit**

```bash
git add packages/database/scripts/import-dealers.ts packages/services/src/dealer-import-rules.ts packages/services/src/dealer-import-rules.test.ts
git commit -m "feat: gated dealer list importer with territory routing"
```

---

### Task 7: Cross-sell tasks for existing customers

Spec §8.4 — dealers already in the book are an upsell, not a prospect.

**Files:**
- Modify: `packages/database/scripts/import-dealers.ts`
- Test: `packages/services/src/dealer-import-rules.test.ts`

**Interfaces:**
- Produces: a `Task` row per matched customer, assigned to `Customer.assignedRepId`

- [ ] **Step 1: Write the failing tests** (Review Focus 3)

```ts
it("builds a cross-sell task naming the brands the customer carries", () => {
  const t = crossSellTaskFor(customer, { ...rec, brands: ["FUEL OFF-ROAD","KG1 FORGED"] });
  expect(t.title).toContain("FUEL OFF-ROAD");
  expect(t.assignedToId).toBe(customer.assignedRepId);
});
it("creates no task for a blacklisted customer", () => {
  expect(crossSellTaskFor(customer, rec, { blacklisted: true })).toBeNull();
});
it("creates no task when the customer has no assigned rep", () => {
  expect(crossSellTaskFor({ ...customer, assignedRepId: null }, rec)).toBeNull();
});
```

- [ ] **Step 2: Run to verify it fails** — Expected: FAIL.
- [ ] **Step 3: Implement `crossSellTaskFor(customer, d, flags?): TaskInput | null`** and call it from the importer for `ALREADY_CUSTOMER` records. These records create **no** `Lead`.
- [ ] **Step 4: Run to verify it passes** — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git commit -am "feat: cross-sell tasks for dealers already in the customer book"
```

---

### Task 8: Tier-ordered release into My Work

Spec §8.3 — 5 slots per rep per day, **shared** with the daily cron, ordered by tier.

**Files:**
- Modify: `apps/rhino-brain/src/actions/my-prospects.ts`

**Interfaces:**
- Consumes: `Lead.meta.tier` written by Task 6

- [ ] **Step 1: Write the failing test** (Review Focus — orphan leak)

```ts
it("never surfaces a lead with a null locationId", async () => { /* … */ });
it("orders tier 2 dealer-list leads above tier 4 ones", async () => { /* … */ });
it("still returns at most 5 rows when both cron and dealer leads exist", async () => { /* … */ });
```

- [ ] **Step 2: Run to verify it fails** — Expected: FAIL.
- [ ] **Step 3: Add `ORDER BY meta->>'tier' NULLS LAST, createdAt DESC`** to the existing prospect query and keep the `take: 5`. Do not change the Claim flow.
- [ ] **Step 4: Run to verify it passes** — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git commit -am "feat: order My Work prospects by dealer tier"
```

---

### Task 9: Type and city/state filters

Spec §8.6 — the fields exist; the filtering does not.

**Files:**
- Modify: `apps/rhino-brain/src/app/(app)/customers/page.tsx`

- [ ] **Step 1: Add a `type` filter** (all `CustomerType` values, new ones included) and **city/state filters**, alongside the existing filters and inside the existing `locationScope`.
- [ ] **Step 2: Verify as a SALES_REP** that the filters never return another location's customers.
- [ ] **Step 3: Commit**

```bash
git commit -am "feat: filter customers by type, city and state"
```

---

### Task 10: Batch reporting

**Files:**
- Modify: `packages/database/scripts/reconcile-dealers.ts` (add `--batch <id>` mode)

- [ ] **Step 1: Add a batch mode** reporting, for one `importBatchId`: leads created, contacted, quoted, converted, and converted value — grouped by tier, so "did the multi-brand tier convert better?" has an answer.
- [ ] **Step 2: Run it against the first import.** Expected: totals reconcile against `Lead` counts for that batch.
- [ ] **Step 3: Commit**

```bash
git commit -am "feat: per-batch dealer list conversion reporting"
```

---

### Task 11: Coordinates and city clustering

Spec §4 Phase 3. The five-brand file has no lat/lng; the earlier Fuel scrape does, for 1,906 rows. Clustering is what turns a list into a rep's route.

**Files:**
- Modify: `packages/services/src/dealer-list-parse.ts` (optional second source)
- Create: `packages/services/src/dealer-cluster.ts`
- Test: `packages/services/src/dealer-cluster.test.ts`

**Interfaces:**
- Produces:
```ts
export function attachCoordinates(records: DealerRecord[], coords: { dedupeKey: string; lat: number; lng: number }[]): DealerRecord[];
export function clusterByCity(records: DealerRecord[]): { city: string; state: string; count: number; members: DealerRecord[] }[];
export function milesFromHub(lat: number, lng: number, hub: "RHINO" | "EVERFLOW"): number;
```
Hubs: Rhino `28.5383,-81.3792`; Everflow `32.8097,-96.8750` (same constants the prospecting cron uses).

- [ ] **Step 1: Write the failing tests**

```ts
it("attaches coordinates by dedupeKey and leaves unmatched records untouched", () => { /* … */ });
it("groups dealers in the same city+state into one cluster, biggest first", () => { /* … */ });
it("computes miles from the Orlando hub within 1 mile of a known distance", () => {
  expect(milesFromHub(28.5383, -81.3792, "RHINO")).toBeCloseTo(0, 1);
});
```

- [ ] **Step 2: Run to verify it fails** — Expected: FAIL.
- [ ] **Step 3: Implement the three functions.** `milesFromHub` uses the haversine already used by `places-collector`. Feed its result into `tierFor`'s `milesFromHub` option.
- [ ] **Step 4: Run to verify it passes** — Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add packages/services/src/dealer-cluster.ts packages/services/src/dealer-cluster.test.ts
git commit -m "feat: dealer coordinates merge and city clustering"
```

---

### Task 12: Enrich and score the released tiers

Spec §4 Phase 1 and §2.3 — enrich only what will be worked, never all 5,064.

**Files:**
- Create: `packages/database/scripts/enrich-dealers.ts`

**Interfaces:**
- Consumes: `resolveWebsite` (Task 5), `fetchSiteText`/`extractEnrichment` from `./prospect-enrich`, `scoreProspect` from `./prospect-score`

- [ ] **Step 1: Implement the script** `npx tsx scripts/enrich-dealers.ts --batch <id> --max-tier 2 --limit N [--dry]`. For each `Lead` in the batch at or above the tier cut and not yet enriched: resolve the website, fetch, enrich, score, then write `enrichment`, `score`, `scoreReasons`, `pool`, `confidence`. Skip any lead that already has `enrichment`.
- [ ] **Step 2: Dry-run.** Expected: the selected count matches the Task 4 report's tier-2 figure; zero API calls.
- [ ] **Step 3: Run with `--limit 20` and inspect.** Expected: pool distribution is not uniformly `C_CHANNEL` — if it is, website resolution is failing and Task 5 needs revisiting before spending more budget.
- [ ] **Step 4: Confirm the cost ledger.** Expected: a `SourceRun` row with token counts for the run.
- [ ] **Step 5: Commit**

```bash
git add packages/database/scripts/enrich-dealers.ts
git commit -m "feat: tier-capped enrichment and scoring for dealer leads"
```

---

## Notes for the executor

**Order:** 1 → 2 → 3 → 11 → 4 → **[owner gate]** → 5 → 6 → 7 → 12 → 8 → 9 → 10.

- Tasks 1, 2, 3, 11 and 5 write nothing to production data except the Task 1 migration.
- Task 11 comes before Task 4 so the reconciliation report can tier using real distances.
- **Task 4 is a hard gate before Task 6.** The owner locked "all home-state dealers" against a 685-row list; the real figure is 1,579 and must be re-confirmed against the reconciliation report before anything is imported.
- Task 12 runs after the import and before release, so reps never see an unscored lead.
- Tasks 6 → 10 are otherwise strictly sequential.
- The outreach/sending engine is explicitly out of scope (spec §10).
