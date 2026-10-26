# 公海客户 (Customer Pool) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unassigned customers become a company-scoped pool reps claim from, and an account with no contact and no sale for 90 days returns to it automatically, after a recorded warning.

**Architecture:** All decision logic is pure and lives in one new import-free services module, unit-tested in `packages/services` (the CRM app has no test harness). The database gains four nullable `Customer` fields plus one small `PoolEvent` table; the pool itself is never stored — it is the absence of `assignedRepId`. A sweep route stamps warnings and recycles, and runs report-only until the owner approves.

**Tech Stack:** Next.js App Router, Prisma 5 / PostgreSQL (Supabase), vitest, TypeScript.

**Spec:** `docs/superpowers/specs/2026-10-26-customer-pool-design.md`

## Global Constraints

- The pool is `assignedRepId IS NULL` **and** `locationId IS NOT NULL` **and** status not in (`LOST`, `DO_NOT_CONTACT`). No pool table, no pool flag.
- Recycle threshold is **90 days**; warning window opens at **day 75**; an account is recycled only when `poolWarnedAt` is **at least 15 days old**.
- The clock runs from the latest of `lastContactAt`, `lastSaleAt`, `assignedAt`.
- Claim cap: **10 customers per rep per rolling 7 days.** MANAGER and ADMIN are uncapped.
- Only `SALES_REP`-held accounts recycle. Accounts held by a deactivated rep (`User.active = false`) pool **immediately**.
- "Contact" is the existing `CONTACT_TYPES` in `apps/rhino-brain/src/actions/activities.ts:12` — `CALL, EMAIL, TEXT, WHATSAPP, QUOTE, ORDER, PAYMENT, VISIT, COMPLAINT`. Do not define a second list.
- Sale evidence is the newest `Invoice.dueDate` for the customer, never the `/api/churn` feed alone (it posts only at-risk customers).
- Reps are location-scoped (`locationScope`/`repScope` in `apps/rhino-brain/src/lib/auth.ts`); a customer must never be visible or claimable across companies.
- Pure logic goes in `packages/services/src/` with zero imports of `@prisma/client`, `xlsx` or `node:fs/promises`; such a value import reachable from a client component passes the build and crashes production at runtime.
- Tests: vitest from `packages/services` (`npm test`, or `npx vitest run src/<file>.test.ts`).
- **No cron entry is added.** `apps/rhino-brain/vercel.json` declares two crons and the plan appears to be Hobby-tier; the sweep is its own route, invoked by `/api/cron/daily-brief`.

## Review Focus

1. **An account claimed today whose last contact was a year ago** must not recycle immediately — the clock starts at `assignedAt`. *(Task 2)*
2. **A customer with a null `locationId`** must never appear in the pool nor be claimable by any role, ADMIN included. *(Tasks 2, 4, 5)*
3. **Two reps clicking Claim at the same instant** — exactly one wins, and the loser is told so rather than silently failing. *(Task 4)*
4. **The sweep running twice in one day** must not double-stamp, double-recycle, or reset a warning clock. *(Task 7)*
5. **A quote with no `expirationDate`, or a follow-up parked years out**, must not protect an account forever. *(Task 2)*

---

### Task 1: Schema — pool fields and the audit table

**Files:**
- Modify: `packages/database/prisma/schema.prisma` (model `Customer`; add model `PoolEvent`, enum `PoolEventKind`)
- Create: `packages/database/prisma/migrations/<timestamp>_customer_pool/migration.sql`

**Interfaces:**
- Produces: `Customer.assignedAt`, `Customer.poolWarnedAt`, `Customer.lastSaleAt` (all `DateTime?`), `Customer.poolExempt` (`Boolean @default(false)`); `PoolEvent { id, customerId, repId?, kind: PoolEventKind, at: DateTime @default(now()), reason: String? }`; `enum PoolEventKind { CLAIM RECYCLE MANUAL_UNASSIGN EXEMPT UNEXEMPT }`.

- [ ] **Step 1: Add the four `Customer` fields, the `PoolEvent` model and the `PoolEventKind` enum.** Index `PoolEvent` on `[customerId, at]` and `[repId, at]` (the claim cap and the per-rep metric both query by rep and date). Index `Customer` on `[poolWarnedAt]`. Relations: `PoolEvent.customer` with `onDelete: Cascade`; `PoolEvent.rep` → `User`, nullable, no cascade.
- [ ] **Step 2: Generate the migration.** Run from `packages/database`: `npx prisma migrate dev --name customer_pool --create-only`. Expected: a new migration directory containing only `ALTER TABLE "Customer" ADD COLUMN`, `CREATE TABLE "PoolEvent"`, `CREATE TYPE "PoolEventKind"` and index statements — **no `DROP`**. Read the SQL and confirm that before applying.
- [ ] **Step 3: Apply it and regenerate the client.** `npx prisma migrate dev` then `npx prisma generate`.
- [ ] **Step 4: Verify the app still builds.** Run from the repo root: `npx turbo run build --filter=rhino-brain`. Expected: `Compiled successfully`.
- [ ] **Step 5: Commit**

```bash
git add packages/database/prisma
git commit -m "feat: customer pool fields and PoolEvent audit table"
```

---

### Task 2: The pure decision module

**Files:**
- Create: `packages/services/src/customer-pool.ts`
- Test: `packages/services/src/customer-pool.test.ts`
- Modify: `packages/services/src/index.ts` (export the public functions and types)

**Interfaces:**
- Consumes: nothing. **This file imports nothing** — follow `packages/services/src/prospect-release.ts` and `customer-filter.ts`.
- Produces:
  - `type PoolCustomer = { id: string; assignedRepId: string | null; locationId: string | null; status: string; poolExempt: boolean; assignedAt: Date | null; lastContactAt: Date | null; lastSaleAt: Date | null; poolWarnedAt: Date | null; nextFollowUpAt: Date | null; repRole: string | null; repActive: boolean | null; protectingQuote: boolean }`
  - `type PoolState = "NOT_POOLABLE" | "IN_POOL" | "HELD_OK" | "HELD_WARNING" | "HELD_RECYCLE"`
  - `type PoolDecision = { state: PoolState; reason: string; clockFrom: Date | null; dueAt: Date | null; daysLeft: number | null }`
  - `decidePool(c: PoolCustomer, now: Date): PoolDecision`
  - `isClaimable(c: PoolCustomer): boolean`
  - `claimCapError(claimsInLast7Days: number, role: string): string | null`
  - Constants: `RECYCLE_AFTER_DAYS = 90`, `WARN_AFTER_DAYS = 75`, `MIN_WARNING_DAYS = 15`, `CLAIM_CAP_PER_7_DAYS = 10`, `FOLLOW_UP_PROTECTION_MAX_DAYS = 30`

- [ ] **Step 1: Write the failing tests**

```ts
// clock baseline — Review Focus 1
it("does not recycle an account claimed today whose last contact was a year ago", () => {
  const d = decidePool(held({ assignedAt: day(0), lastContactAt: day(-365) }), day(0));
  expect(d.state).toBe("HELD_OK");
  expect(d.clockFrom).toEqual(day(0));
});
it("runs the clock from the latest of assignedAt, lastContactAt and lastSaleAt", () => {
  expect(decidePool(held({ assignedAt: day(-200), lastContactAt: day(-100), lastSaleAt: day(-10) }), day(0)).clockFrom)
    .toEqual(day(-10));
});
// the 90/75/15 rule
it("is HELD_OK before day 75", () => expect(decidePool(held({ lastContactAt: day(-74) }), day(0)).state).toBe("HELD_OK"));
it("is HELD_WARNING from day 75", () => expect(decidePool(held({ lastContactAt: day(-75) }), day(0)).state).toBe("HELD_WARNING"));
it("reports days left during the warning window", () =>
  expect(decidePool(held({ lastContactAt: day(-80) }), day(0)).daysLeft).toBe(10));
it("will not recycle at day 90 when the warning was never recorded", () =>
  expect(decidePool(held({ lastContactAt: day(-90), poolWarnedAt: null }), day(0)).state).toBe("HELD_WARNING"));
it("will not recycle when the warning is younger than 15 days", () =>
  expect(decidePool(held({ lastContactAt: day(-90), poolWarnedAt: day(-14) }), day(0)).state).toBe("HELD_WARNING"));
it("recycles at day 90 once the warning is 15 days old", () =>
  expect(decidePool(held({ lastContactAt: day(-90), poolWarnedAt: day(-15) }), day(0)).state).toBe("HELD_RECYCLE"));
// protections — Review Focus 5
it("protects an account with a follow-up inside 30 days", () =>
  expect(decidePool(held({ lastContactAt: day(-120), poolWarnedAt: day(-20), nextFollowUpAt: day(29) }), day(0)).state).toBe("HELD_OK"));
it("does NOT protect an account whose follow-up is parked beyond 30 days", () =>
  expect(decidePool(held({ lastContactAt: day(-120), poolWarnedAt: day(-20), nextFollowUpAt: day(400) }), day(0)).state).toBe("HELD_RECYCLE"));
it("protects an account with a live quote", () =>
  expect(decidePool(held({ lastContactAt: day(-120), poolWarnedAt: day(-20), protectingQuote: true }), day(0)).state).toBe("HELD_OK"));
it("never recycles a poolExempt account", () =>
  expect(decidePool(held({ lastContactAt: day(-400), poolWarnedAt: day(-100), poolExempt: true }), day(0)).state).toBe("HELD_OK"));
it("never recycles a manager- or admin-held account", () => {
  for (const repRole of ["MANAGER", "ADMIN"])
    expect(decidePool(held({ repRole, lastContactAt: day(-400), poolWarnedAt: day(-100) }), day(0)).state).toBe("HELD_OK");
});
it("pools a deactivated rep's account immediately, with no warning wait", () =>
  expect(decidePool(held({ repActive: false, lastContactAt: day(-1) }), day(0)).state).toBe("HELD_RECYCLE"));
// pool membership — Review Focus 2
it("is NOT_POOLABLE when locationId is null", () =>
  expect(decidePool(unassigned({ locationId: null }), day(0)).state).toBe("NOT_POOLABLE"));
it.each(["LOST", "DO_NOT_CONTACT"])("is NOT_POOLABLE when status is %s", status =>
  expect(decidePool(unassigned({ status }), day(0)).state).toBe("NOT_POOLABLE"));
it("pools an INACTIVE unassigned customer", () =>
  expect(decidePool(unassigned({ status: "INACTIVE" }), day(0)).state).toBe("IN_POOL"));
it("isClaimable only for IN_POOL", () => {
  expect(isClaimable(unassigned({}))).toBe(true);
  expect(isClaimable(unassigned({ locationId: null }))).toBe(false);
  expect(isClaimable(held({}))).toBe(false);
});
// the cap
it("allows the 10th claim in 7 days and refuses the 11th", () => {
  expect(claimCapError(9, "SALES_REP")).toBeNull();
  expect(claimCapError(10, "SALES_REP")).toMatch(/10/);
});
it("does not cap managers or admins", () => {
  for (const role of ["MANAGER", "ADMIN"]) expect(claimCapError(50, role)).toBeNull();
});
```

Helpers `held(partial)`, `unassigned(partial)` and `day(n)` (n days from a fixed `NOW`) belong in the test file; `held` defaults `repRole: "SALES_REP"`, `repActive: true`, `assignedRepId: "rep_1"`.

- [ ] **Step 2: Run to verify they fail** — `npx vitest run src/customer-pool.test.ts`. Expected: FAIL, `decidePool is not a function`.
- [ ] **Step 3: Implement `decidePool`, `isClaimable`, `claimCapError` and the constants in `packages/services/src/customer-pool.ts`.** Evaluate in this order: not-poolable conditions, then unassigned → `IN_POOL`, then held-account protections (exempt, manager/admin role, live quote, follow-up within `FOLLOW_UP_PROTECTION_MAX_DAYS`), then the deactivated-rep short circuit, then the clock. `reason` is a short human sentence for the audit trail and the UI.
- [ ] **Step 4: Run to verify they pass**, then mutate each assertion's guard, confirm red, and restore.
- [ ] **Step 5: Export from `packages/services/src/index.ts` and run the full suite** — `npm test` from `packages/services`. Expected: all green, output pristine.
- [ ] **Step 6: Commit**

```bash
git add packages/services/src/customer-pool.ts packages/services/src/customer-pool.test.ts packages/services/src/index.ts
git commit -m "feat: pure customer-pool eligibility and recycle decision"
```

---

### Task 3: Sale evidence — maintain `lastSaleAt`

**Files:**
- Create: `packages/database/scripts/refresh-last-sale.ts`
- Modify: `apps/rhino-brain/src/actions/ar-import.ts` (refresh the touched customers after an import)

**Interfaces:**
- Consumes: `Customer.lastSaleAt` from Task 1.
- Produces: a reusable `refreshLastSale(db, customerIds?)` helper exported from the script file, setting `lastSaleAt` to `MAX(Invoice.dueDate)` per customer (all customers when `customerIds` is omitted).

- [ ] **Step 1: Write the script with a `--dry` flag** that reports how many customers would change and how many invoice rows have no customer link (229 at the time of writing — they protect nobody, and the count must be visible).
- [ ] **Step 2: Run `--dry` against production and record the output in the task report.** Expected: ~678 customers with invoices, ~335 with a `dueDate` in the last 90 days.
- [ ] **Step 3: Run it for real**, then verify with a read-only query that `lastSaleAt` is non-null for exactly the customers that have invoices.
- [ ] **Step 4: Call `refreshLastSale` for the affected customers at the end of a successful A/R import** in `ar-import.ts`, so the signal stays fresh without a separate schedule.
- [ ] **Step 5: Commit**

```bash
git add packages/database/scripts/refresh-last-sale.ts apps/rhino-brain/src/actions/ar-import.ts
git commit -m "feat: track last sale date from A/R invoices"
```

---

### Task 4: Claim action

**Files:**
- Create: `apps/rhino-brain/src/actions/customer-pool.ts`
- Modify: `packages/services/src/index.ts` only if Task 2 missed an export

**Interfaces:**
- Consumes: `decidePool`, `isClaimable`, `claimCapError`, `CLAIM_CAP_PER_7_DAYS` (Task 2); `repAssignmentError` (already in services); `requireSession`, `locationScope` from `@/lib/auth`.
- Produces: `claimCustomer(customerId: string): Promise<{ ok: boolean; error?: string }>`; `setPoolExempt(customerId: string, exempt: boolean): Promise<{ ok: boolean; error?: string }>` (manager or ADMIN only).

- [ ] **Step 1: Implement `claimCustomer` following `claimProspect` in `apps/rhino-brain/src/actions/my-prospects.ts:33-48`** — same shape, same atomicity. Load the customer with the fields `PoolCustomer` needs plus a live-quote check; refuse unless `isClaimable`; refuse on `claimCapError` counting `PoolEvent` rows of kind `CLAIM` for this rep in the last 7 days; refuse on `repAssignmentError`; then claim with an atomic `updateMany({ where: { id, assignedRepId: null }, data: { assignedRepId, assignedAt: new Date(), poolWarnedAt: null } })`. **Review Focus 3:** a `count !== 1` result means a teammate won — return `"A teammate just claimed this one"`, not a generic failure.
- [ ] **Step 2: Write the `PoolEvent` (`kind: CLAIM`) and an `INTERNAL_NOTE` `Activity`** in the same transaction as the claim, then `revalidatePath` for `/customers`, `/customers/pool` and `/my-work`.
- [ ] **Step 3: Implement `setPoolExempt`**, writing `PoolEvent` kind `EXEMPT`/`UNEXEMPT`. Gate on `requireManager`.
- [ ] **Step 4: Verify company isolation and the cap against production, read-only** — confirm a rep's scope cannot see another location's pool customer, and that an 11th claim in 7 days is refused. Record the evidence in the task report.
- [ ] **Step 5: Commit**

```bash
git add apps/rhino-brain/src/actions/customer-pool.ts
git commit -m "feat: claim a customer from the pool, rate-capped and audited"
```

---

### Task 5: The pool page

**Files:**
- Create: `apps/rhino-brain/src/app/(app)/customers/pool/page.tsx`
- Create: `apps/rhino-brain/src/components/claim-customer-button.tsx` (client)
- Modify: `apps/rhino-brain/src/app/(app)/customers/page.tsx` (a link with the pool count)

**Interfaces:**
- Consumes: `claimCustomer` (Task 4); `buildCustomerFilterWhere` and `CUSTOMER_FILTER_STATES` (already in services); `locationScope`, `requireSession`.
- Produces: nothing other tasks consume.

- [ ] **Step 1: Build the page.** Query the pool with `locationScope` always applied and `locationId: { not: null }`; reuse `buildCustomerFilterWhere` for the type/city/state filters. Columns: company, city/state, type, status, last contact (or "never"), **last sale**, who held it last (newest `PoolEvent` of kind `RECYCLE` or `MANUAL_UNASSIGN`), and Claim. Default order: never-contacted first, then oldest `lastContactAt`.
- [ ] **Step 2: Make the buying-but-unowned customers findable** — a sort or filter on `lastSaleAt` descending. Spec §6.8 wants these first in line; at the time of writing 20 pool customers were invoiced within 90 days.
- [ ] **Step 3: Add the claim button**, disabled while pending, showing the server's error text on failure (including the teammate-won message).
- [ ] **Step 4: Add the pool count link on `/customers`.**
- [ ] **Step 5: Verify the app builds and the page renders for each role.** `npx turbo run build --filter=rhino-brain`, then read the page as ADMIN and as a location-scoped rep via a read-only query standing in for each scope; confirm counts match (329 FL / 25 TX at the time of writing).
- [ ] **Step 6: Commit**

```bash
git add apps/rhino-brain/src/app/\(app\)/customers/pool apps/rhino-brain/src/components/claim-customer-button.tsx apps/rhino-brain/src/app/\(app\)/customers/page.tsx
git commit -m "feat: 公海 customer pool page with claim"
```

---

### Task 6: Show the warning to the rep who can act on it

**Files:**
- Modify: `apps/rhino-brain/src/app/(app)/customers/page.tsx` (row badge)
- Modify: `apps/rhino-brain/src/app/(app)/customers/[id]/page.tsx` (countdown and what resets it)

**Interfaces:**
- Consumes: `decidePool` (Task 2).

- [ ] **Step 1: Render a badge on the customers list** for any row whose `decidePool` state is `HELD_WARNING`, reading "returns to pool in N days".
- [ ] **Step 2: On the customer page, show the countdown, the clock's source date, and the one-line remedy** ("log a call, email, visit or quote — or a new sale — to reset this").
- [ ] **Step 3: Verify the build**, and confirm with a read-only query that the badge count equals the number of `HELD_WARNING` customers.
- [ ] **Step 4: Commit**

```bash
git commit -am "feat: warn a rep before an account returns to the pool"
```

---

### Task 7: The sweep

**Files:**
- Create: `apps/rhino-brain/src/app/api/cron/customer-pool/route.ts`
- Modify: `apps/rhino-brain/src/app/api/cron/daily-brief/route.ts` (invoke the sweep after its own work)

**Interfaces:**
- Consumes: `decidePool` (Task 2).
- Produces: a `GET` returning `{ scanned, warned, recycled, skipped, reportOnly, movedList }`.

- [ ] **Step 1: Implement the route.** Auth exactly as `apps/rhino-brain/src/app/api/cron/prospecting/route.ts:18-21` (`Bearer ${process.env.CRON_SECRET}`), plus `export const dynamic = "force-dynamic"`. For every `SALES_REP`-held customer: compute `decidePool`; stamp `poolWarnedAt` when the state is `HELD_WARNING` **and `poolWarnedAt` is null**; on `HELD_RECYCLE` clear `assignedRepId`, `assignedAt` and `poolWarnedAt`, write `PoolEvent` kind `RECYCLE` with the decision's `reason`, write the `INTERNAL_NOTE` `Activity` attributed to the outgoing rep, and close that rep's open `Task` rows for the customer with a reason.
- [ ] **Step 2: Gate recycling behind `CUSTOMER_POOL_SWEEP_LIVE`.** Absent or not `"true"` ⇒ report-only: stamp warnings, compute and return `movedList`, write nothing else. Spec §6.3 requires the first run be report-only.
- [ ] **Step 3: Write the idempotence test** (Review Focus 4) in `packages/services/src/customer-pool.test.ts` — a second `decidePool` on an already-stamped customer must return the same state and must not move `poolWarnedAt`; mutate the null-check to confirm the test bites.
- [ ] **Step 4: Call the sweep from `daily-brief` after its own work**, failing soft: a sweep error must be logged and must not fail the brief. No new `vercel.json` entry — only two cron slots exist.
- [ ] **Step 5: Run it report-only against production** with `CUSTOMER_POOL_SWEEP_LIVE` unset and paste the full output into the task report, including how many accounts it *would* move. Expect a large number — about 1,231 before Task 8's backfill, which is exactly why Task 8 exists.
- [ ] **Step 6: Commit**

```bash
git add apps/rhino-brain/src/app/api/cron/customer-pool apps/rhino-brain/src/app/api/cron/daily-brief/route.ts packages/services/src/customer-pool.test.ts
git commit -m "feat: daily customer-pool sweep, report-only until enabled"
```

---

### Task 8: Go-live backfill — **owner-gated**

**Files:**
- Create: `packages/database/scripts/pool-golive.ts`

**Interfaces:**
- Consumes: `Customer.assignedAt` (Task 1).

- [ ] **Step 1: Write the script.** Default is `--dry`; writing requires `--yes`. It sets `assignedAt = <go-live timestamp>` for every customer where `assignedRepId IS NOT NULL AND assignedAt IS NULL`, and writes nothing else. Print the count, and the count that would recycle immediately with and without the backfill.
- [ ] **Step 2: Run `--dry` and paste the output in the task report.** Expected: ~2,263 customers to stamp; without the backfill ~1,231 would be eligible to recycle, with it zero for 90 days.
- [ ] **Step 3: STOP. Do not run with `--yes`.** This is the one irreversible step in the plan and the spec (§7.1) requires the owner's explicit approval. Report DONE_WITH_CONCERNS naming the `--dry` figures and wait.
- [ ] **Step 4: Commit the script only**

```bash
git add packages/database/scripts/pool-golive.ts
git commit -m "feat: pool go-live backfill script (dry by default, --yes gated)"
```

---

### Task 9: Audit manual unassignment

**Files:**
- Modify: `apps/rhino-brain/src/actions/customers.ts` (the `updateCustomer` path that can blank `assignedRepId`)

**Interfaces:**
- Consumes: `PoolEvent` (Task 1).

- [ ] **Step 1: When an update clears `assignedRepId`, also clear `assignedAt` and `poolWarnedAt` and write `PoolEvent` kind `MANUAL_UNASSIGN`.** Without this the pool gains accounts with no record and Task 10's trend cannot be reconstructed.
- [ ] **Step 2: Verify** that reassigning from one rep to another sets a fresh `assignedAt` — otherwise the new rep inherits the old rep's clock and can lose the account at once.
- [ ] **Step 3: Commit**

```bash
git commit -am "fix: audit manual unassignment and reset the pool clock on reassignment"
```

---

### Task 10: Owner metrics

**Files:**
- Modify: `apps/rhino-brain/src/app/(app)/customers/pool/page.tsx` (a manager-only summary block)

**Interfaces:**
- Consumes: `PoolEvent` (Task 1).

- [ ] **Step 1: For managers and ADMIN, show pool size now, claims and recycles in the last 7 and 30 days, and claims per rep** (the figure that makes both hoarding and day-89 token contacts visible). Count `PoolEvent` rows; do not parse activity text.
- [ ] **Step 2: Verify the build and that the numbers match a read-only query.**
- [ ] **Step 3: Commit**

```bash
git commit -am "feat: pool metrics for managers"
```

---

## Deviations from the spec, recorded here

- **§6.3 said the sweep gets its own cron entry.** It gets its own *route*, invoked by `daily-brief`: `apps/rhino-brain/vercel.json` declares two crons and the codebase notes a Hobby-tier limit, so a third entry may not be available. Observability is preserved (separate route, separate response, independently callable); if the account has a spare cron slot, adding the entry and dropping the `daily-brief` call is a one-line change.
- **§6.4's churn-feed `lastSale`** is not read. The feed posts only at-risk customers, so `Invoice` is the whole signal; storing the churn value as well would add a second source of truth for no gain.
