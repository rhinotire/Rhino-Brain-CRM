# 公海客户 (Customer Pool) — Design

**Owner decisions, 2026-10-26:** unassigned customers sit in a shared pool; reps take them from
there; **a customer with no contact for 3 months returns to the pool**; and **a recent sale protects
an account** even when no contact was logged.

**Status:** design, awaiting owner approval. Nothing built.

---

## 1. Intent, and why now

**354 of 2,615 customers (13.5%) have no rep** — 329 Florida, 25 Texas. They are not junk:
**215 have been contacted before** and then dropped, 317 have a phone number, 292 a named contact.
Their data is as complete as the assigned book's. Somebody worked them and walked away, and nothing
in the CRM has noticed since. No surface shows them, so no rep can find them, so they decay.

**20 of those 354 were invoiced in the last 90 days.** They are buying from Rhino right now and
nobody owns them. That is the clearest statement of the problem available.

The owner's framing: a **公海** reps take from, with accounts pushed back when their rep stops
working them. The second half is what matters — a pool that only drains recreates today's problem
with a nicer interface. **Use-it-or-lose-it is the design.**

## 2. The number that shapes everything

**1,231 of 2,263 assigned customers (54%) have no logged contact in the last 90 days.**

A 90-day rule applied to the existing book would move **1,231 accounts into the pool on the first
sweep**. Sale protection (§6.4) rescues 184 of them; roughly 1,047 would still move at once. That is
not a feature launch, it is an involuntary reorganisation of every rep's book, and it would destroy
confidence in the system on day one.

So the rule **governs from go-live forward, not retroactively**: `assignedAt` is backfilled to the
go-live date (§6.6), which gives every existing account a full 90-day grace period and every rep 90
days of visible warnings before anything can move. The existing 1,231 become a **report the owner
reads and acts on deliberately**, not a mass unassignment.

This is the single most important decision in the document and it is a correction to my own first
draft, which backfilled from `updatedAt` and would have fired immediately on much of the book.

## 3. Goals

1. A rep sees every unassigned customer **in their own company** and takes one in a click.
2. No contact and no sale for **90 days** → back to the pool, automatically.
3. A rep is warned **before** losing an account, and the remedy is one logged call.
4. Accounts that must not be grabbed first-come are structurally protected.
5. The owner can see pool size, claims and recycles over time, and claims per rep.
6. The 20 buying-but-unowned customers are surfaced immediately, ahead of the rest of this.

## 4. Non-goals

- No manager approval step for a claim (§6.2 — a decision, not an omission).
- No rep-to-rep transfer flow; `/customers` already reassigns.
- No change to **lead** claiming on `/my-work`. This is `Customer`, not `Lead`.
- Nothing about the 2,919 parked dealer leads.
- No retroactive recycling of the existing book (§2).

## 5. Anti-goals — failure even if it ships working

- **A rep loses an account they are actively working.** Warning window (§6.3), sale protection
  (§6.4) and in-flight protection (§6.5) all exist for this and none is optional.
- **A mass unassignment on day one** (§2).
- **The pool becomes a dumping ground** — everyone's neglect lands there and nobody claims. Watch
  the trend (§6.8); a pool that only grows means the rule punishes rather than works.
- **A rep games it** with a token contact on day 89. Partly a people problem; the per-rep metrics
  make the pattern visible rather than hiding it.
- **One company's customers reaching the other company's rep.** Rhino FL and Everflow TX share one
  database. This has been the repeated hazard in this codebase and is never acceptable.

## 6. The design

### 6.1 What the pool is

A customer is **in the pool** when `assignedRepId IS NULL`, `locationId` is **not** null, and status
is not `LOST` or `DO_NOT_CONTACT`. No pool table, no pool flag — the pool is a view over the absence
of a rep, so it cannot drift out of sync with reality.

`locationId = null` is never claimable: no rep could own it without breaking company scoping.

### 6.2 Claiming — instant, rate-capped. **My call; overrule this one if you disagree.**

A rep clicks **Claim** and it is theirs immediately. No approval.

The owner's first phrasing was "申请认领" (apply to claim). I am designing the opposite deliberately:
routing every claim through a manager rebuilds the bottleneck that produced 354 orphans, and the
recycle rule already supplies the control an approval step would. Approval adds delay and a decision
queue and buys nothing the rule does not.

Against a day-one land grab (329 FL accounts, 9 reps): **a rep may claim at most 10 customers per
rolling 7 days.** Managers and ADMIN are uncapped. The cap is on claims from the pool, not on book
size; nobody's existing book is touched.

If the owner prefers approval, it replaces §6.2 alone.

### 6.3 Recycling — 90 days, 15-day warning, warning actually recorded

A customer returns to the pool when **90 days** have passed since the latest of:

- `lastContactAt` — the last contact-type activity
- `lastSaleAt` — the most recent sale (§6.4)
- `assignedAt` — when the current rep got it (§6.6)

`assignedAt` is required for correctness: without it, a rep claiming an account last touched a year
ago would lose it the same day. The clock starts when you take it.

**The warning must be real, not merely derivable.** A stateless clock would let the first sweep
remove accounts that were never actually shown as at-risk. So:

- From day 75 the sweep stamps `poolWarnedAt` and the account shows "returns to the pool in N days"
  to its rep — on the customer row, the customer page, and their daily surface.
- **An account is only recycled if `poolWarnedAt` is at least 15 days old.** No warning, no removal.
- Any contact-type activity or a new sale clears `poolWarnedAt` and resets the clock.

**Rollout:** the first sweep runs **report-only**. It stamps warnings and writes the list of accounts
it *would* move, and recycles nothing until the owner approves. That report is also how the owner
identifies accounts to mark `poolExempt` (§6.5) before anything moves.

Runs daily as its own cron route `/api/cron/customer-pool` — separate from `daily-brief` so it is
independently observable and cannot take the brief down. Idempotent; logs every account it moves.

### 6.4 Sale protection — **owner decision**

A sale within 90 days protects an account exactly as a logged contact does. A rep whose customer buys
weekly at the TireGuru counter must not lose that account because the sale was never typed into
the CRM.

**Where the sale date comes from — and where it must not.** The `/api/churn` feed carries a
`lastSale` (`route.ts:28`) but posts **only the at-risk list**, so it has dates for *quiet* customers
and nothing for healthy ones: using it alone would protect precisely the wrong accounts. The usable
signal already in the database is **`Invoice`** — 4,022 rows covering 678 customers, imported by the
TireGuru A/R sync, with **335 customers invoiced in the last 90 days**.

So: `lastSaleAt` is maintained as the newest `Invoice.dueDate` for the customer, refreshed when A/R
imports run, and the churn feed's `lastSale` is stored too when it arrives (strictly as an additional
signal, never the only one). `Invoice.dueDate` is a sale date plus payment terms rather than a true
sale date — close enough to protect an account, and erring toward protection is the right direction.

Known limit worth stating: **229 invoice rows have no customer link**, so a customer whose invoices
all failed to match is not protected by this. The name matching is a pre-existing gap, not this
feature's to fix, but the sweep's report should count such accounts so the owner can see them.

### 6.5 What never recycles, and never enters the pool

| Condition | Why |
|---|---|
| `status = DO_NOT_CONTACT` or `LOST` | Never hand a blacklisted or dead account to whoever clicks first. Not pooled at all. |
| A live deal: a non-draft `Quote` with a future `expirationDate`, or any non-draft quote created within 30 days, or an `ACCEPTED` quote within 90 days | Do not yank an account out from under a negotiation because paperwork outran the phone log. **Bounded on purpose:** a `SENT` quote with no expiry would otherwise protect forever. |
| `Customer.nextFollowUpAt` in the future **and within 30 days** | A scheduled call is real work. Capped at 30 days so a rep cannot park a 2030 follow-up and hold an account indefinitely. |
| `poolExempt = true` | Owner-pinned key account. Never recycles, never pooled. |
| `locationId IS NULL` | No rep can own it without breaking company scoping. |
| Held by a MANAGER or ADMIN | A manager holding an account is deliberate. Only `SALES_REP`-held accounts recycle. |

`INACTIVE` customers **do** pool (11 of today's 354) — a dormant account is what a pool is for; the
list shows the status so a rep knows what they are taking.

**Accounts held by a deactivated rep (`User.active = false`) pool immediately**, not after 90 days.
An inactive rep works nothing, and this is the fastest way to surface real orphans.

### 6.6 Schema — three nullable fields and one small table

```
Customer.assignedAt    DateTime?                 // when the CURRENT rep got it
Customer.poolWarnedAt  DateTime?                 // when the at-risk warning was first shown
Customer.lastSaleAt    DateTime?                 // newest sale evidence (§6.4)
Customer.poolExempt    Boolean  @default(false)  // owner-pinned key account

model PoolEvent {                                // claim / recycle / manual unassign / exempt
  id, customerId, repId?, kind, at, reason
}
```

**`assignedAt` is backfilled to the go-live date, not `updatedAt`** (§2). This is the decision that
turns a 1,231-account mass unassignment into a 90-day grace period, and it needs the owner's explicit
yes before it runs.

**`PoolEvent` is a correction to my first draft**, which said "no new tables". That was
over-constrained: the 10-per-week cap, claims per rep, recycles per week and pool size over time all
need countable events, and deriving them by parsing `INTERNAL_NOTE` text would be fragile — a recycle
note is attributed to the outgoing rep, so the two kinds could not be told apart reliably.

**Manual unassignment must be audited too.** `updateCustomer` can blank `assignedRepId` today without
writing anything or clearing `assignedAt`; the pool would gain accounts with no record and the trend
could not be reconstructed. That path must clear `assignedAt` and write a `PoolEvent`.

### 6.7 Open work on a recycled account

Quotes and opportunities **stay with the rep who created them** — they are historical record and
reassigning authorship would be wrong. **Open `Task` rows for that customer assigned to the outgoing
rep are closed** with a reason; leaving a rep tasks for an account they no longer own is how a task
list becomes noise.

`/api/churn` assigns its REACTIVATION tasks to the customer's rep; for a pool customer there is none,
so it **skips task creation** rather than inventing an owner. Those customers surface on the pool page
instead, which is where someone can act on them.

### 6.8 Visibility

- `/customers/pool` — scoped, with Claim. Columns: company, city/state, type, status, last contact
  (or "never"), **last sale**, who held it last. Default sort: never-contacted first, then oldest
  contact. Reuses the type/city/state filters just shipped.
- A count badge wherever `/customers` is linked, so the pool is discoverable without being told.
- On a customer page inside the warning window: the countdown and what resets it.
- For the owner: pool size, claims and recycles per week, and **claims per rep** — the number that
  makes both hoarding and day-89 token contacts visible.
- **Ahead of all of the above:** the 20 unassigned customers invoiced in the last 90 days, as a list
  the owner can assign from immediately. It needs none of this machinery and is the fastest value here.

### 6.9 Audit

Every claim, recycle, manual unassign and exemption writes a `PoolEvent`, and additionally an
`Activity` (`INTERNAL_NOTE`) on the customer so it appears in the timeline a rep already reads —
"claimed from pool by Cesar", "returned to pool: no contact or sale since 2026-07-28".
`Activity.repId` is required, so a recycle is attributed to the **outgoing** rep.

## 7. Calls I made that the owner should check

1. **`assignedAt` backfills to go-live, so nothing recycles for 90 days** (§2, §6.6). Needs an
   explicit yes. Without it the first sweep moves ~1,047-1,231 accounts.
2. **Instant claim with a 10-per-week cap instead of request-and-approve** (§6.2) — contradicts the
   owner's first phrasing, and the most likely of these to be wrong.
3. **The first sweep is report-only**, and no account is recycled without 15 recorded days of warning
   (§6.3).
4. **Sale evidence comes from `Invoice`, not the churn feed** (§6.4), because the churn feed only
   carries at-risk customers.
5. **In-flight protection is bounded** — quotes and follow-ups cannot protect an account forever (§6.5).
6. **Manager/ADMIN-held accounts never recycle; a deactivated rep's accounts pool immediately** (§6.5).
7. **A `PoolEvent` table**, reversing my own "no new tables" constraint (§6.6).
8. **Open tasks are closed on recycle; quotes and opportunities are not touched** (§6.7).

## 8. Left to the builder

The pool page's layout and empty state; the countdown's wording; where the warning appears in the
rep's daily surface; how the owner's metrics are presented; and test placement — pure
recycle-eligibility and claim-eligibility predicates in `packages/services/src/`, per the
`prospect-release.ts` / `customer-filter.ts` precedent, since `apps/rhino-brain` has no test harness.
