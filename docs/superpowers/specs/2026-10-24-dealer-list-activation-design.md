# Activating the Fuel Off-Road Dealer List — Design

**Date:** 2026-10-24
**Status:** Decisions locked by owner 2026-10-24 (§8). Implementation plan next. Nothing built yet.
**Input (revised 2026-10-24):** `OneDrive\Documents\RHINO BRAIN WHEEL CUSTOMER\Dealer-Locators-2026-10-23.xlsx`
— five brand sheets (KG1 Forged 3,437 · Fuel Off-Road 1,796 · JTX Forged 423 · Golf Cart/STEELENG 383
· American Force 209) = **6,248 brand-rows → 5,064 unique dealers** after phone/name+city dedupe.
Columns: State, City, Dealer Name, Street, Zip, Country, Phone, Email, Website.

Supplemented by `Fuel_Off_Road_Dealers_2026-10-23.xlsx` (1,906 rows) **for its lat/lng only** —
the five-brand file has no coordinates, and coordinates are what make §4 Phase 3 city-clustering
and drive-time routing possible. Merge is by phone, then name+city.

---

## 1. Why this list is not just 1,906 more cold leads

Every dealer on it has already passed a qualification Rhino cannot run itself:

- They **stock aftermarket wheels**, so they have a wheel program and customers who buy them.
- They **hold a brand relationship**, so they buy wholesale, carry credit terms, and can take volume.
- Wheel dealers sell **wheel + tire packages**. A dealer selling Fuel wheels is selling tires
  with them — from somebody.

That changes the opening line from "do you buy tires?" to "you already sell Fuel — who supplies
the tires that go on them?" The list is a **competitor's distribution map**, and the highest-value
rows are the ones closest to a Rhino or Everflow warehouse, because freight is what decides whether
Rhino can beat the incumbent on landed cost.

**This is the whole point of the exercise.** Everything below exists to get the right 200 of these
in front of the right rep with that opening, and to keep the other 1,700 from drowning it.

---

## 2. What the code says will break if we just import them

Four blockers found by reading the existing pipeline, not guessed:

**2.1 — 922 dealers would land invisible.**
`prospect-pipeline.ts:147` sets `locationId` to Rhino for `RHINO_STATES`, Everflow for
`EVERFLOW_STATES`, Qingdao for non-US, and **`null` for every other US state**. Reps are
location-scoped (`company-isolation-rule`), so a `null` location means only ADMIN ever sees the
row. 922 of 1,607 US dealers fall outside both state lists. This is the already-known open owner
decision in the prospecting memo; this list forces it.

**2.2 — The enrichment step has almost nothing to chew on.**
`runProspectingPipeline` calls `fetchSiteText(c.website)` then `extractEnrichment`. The five-brand
file carries a Website column but it is populated for **5 of 5,064 rows (0.1%)**. Feeding these in
as-is produces empty enrichment, and `scoreProspect` then grades on company name and state alone —
every row returns a weak `C_CHANNEL` and the calibration queue is worthless. A **website-resolution
step is required before scoring.**

Email is the one bright spot: **1,466 of 5,064 (29%) carry an email address**, so those rows skip
contact discovery (and the Apollo credit) entirely.

**2.2b — The Country column is corrupt; route by State.**
Distinct Country values include `USAA` on 1,594 rows (typo for USA), blanks on 1,538, and several
rows with a ZIP code or a phone number sitting in the Country field. **State is the reliable
field** — 4,791 rows carry a valid US state code and 206 a Canadian province. The existing
`assignStateLocation(state)` already keys off state, so this costs nothing, but nothing downstream
may trust Country.

**2.3 — Cost and time are real at this volume.**
Enrich + score is **two Claude calls per lead**. 1,906 leads ≈ 3,800 calls in one run. The
`SourceRun` / `AiUsage` ledgers will capture it, but it should be spent on dealers we will actually
call, not on all of them up front.

**2.4 — The queue would bury the daily cron.**
The daily prospecting cron deliberately adds ~12 leads per area per day. Dropping 1,906 into the
same queue hides that drip completely and overwhelms the reps. Only **59** of these dealers sit
inside the existing 50-mile Orlando/Dallas rings — meaning **626 home-state dealers the current
machine was never going to find**. That is the prize, and it is worth protecting from the noise.

---

## 3. Territory reality

| Bucket | Dealers | Who can work it today |
|---|---:|---|
| Rhino states — FL GA AL SC NC TN MS | 778 | Orlando reps |
| Everflow states — TX OK LA AR NM | 801 | Dallas/Mesquite reps |
| **Home-state total** | **1,579** | |
| Other US states | ~3,212 | **nobody** — no location, no rep |
| Canada | 206 | Qingdao routing exists; no NA rep |
| Unresolvable state | ~67 | quarantine, do not import |

### 3.1 Brand overlap — the quality signal

Dealers appear across brand sheets. The count is a free, hard-evidence quality score that beats
anything `scoreProspect` can infer from a company name:

| Brands carried | Dealers | Reading |
|---:|---:|---|
| 4 | 27 | the most serious wheel retailers on the continent |
| 3 | 99 | major wheel programs |
| 2 | 776 | established wheel buyers |
| 1 | 4,162 | ordinary |

**902 dealers carry 2+ brands; 325 of those are in home states.** That 325 is the real Tier 1 —
a sharper target than "all 1,579 home-state dealers" and far sharper than the original 685.

---

## 4. The plan

### Phase 0 — Reconcile before spending anything (half a day)

Import to `ImportBatch` + `Lead` staging **with no rep visibility and no AI calls**, then run every
row through the gates that already exist:

1. `dedupeKeyFor({ phone, companyName, city })` — the list has phone for 1,901 of 1,906, and
   dedupe priority is domain > phone > name+city, so phone is a strong key here.
2. `isExcluded()` against the 1,444-row `ExclusionList` — this is what tells us how many are
   **already Rhino/Everflow customers** (1,437 `EXISTING_CUSTOMER` rows).
3. `findBlacklistMatch()` — bad-credit/fraud rows get dropped outright, never shown to a rep.
4. Match against existing `Lead.dedupeKey` so the daily cron's finds are not duplicated.

**Deliverable: a reconciliation report** — already a customer / already a lead / blacklisted /
genuinely new, broken down by state. Nobody is assigned anything until that number is known.

The most valuable output here is the *already a customer* set: those dealers prove Rhino already
sells to Fuel dealers, and they are a **wheel upsell list**, not a cold list. They should route to
the owning rep as an existing-account action, not into prospecting at all.

### Phase 1 — Enrich only what will be worked

Run website resolution + enrichment + six-check scoring on **Tier 1 only** (defined in §5),
roughly 200–400 rows rather than 1,906. Reuse `prospect-enrich`, `scoreProspect`, and the Apollo
decision-maker lookup that is already wired (match by person `id`, never by name).

Website resolution is the one genuinely new piece: Google Places text search on
`"<name>" <city> <state>` returns the website and confirms the business is still trading. Places
is already integrated and the free tier covers this cadence.

### Phase 2 — Route and assign

- Home-state dealers → `locationId` by the existing state maps, then into the **existing Claim
  flow**. That mechanism already works and is race-guarded; do not build a second one.
- **The 922 orphans do not get a rep.** No rep covers Montana. They become an inside-sales /
  email-nurture pool, held until the Phase 1b sending engine exists, and worked by one person or
  not at all. Assigning them to a field rep is how a list like this dies.
- Canada's 194 route to Qingdao per existing logic — genuinely interesting for container sales,
  but it is a separate motion and should not compete with Phase 1.

### Phase 3 — Work it as a drip, in routes

Feed Tier 1 into the existing "🎯 Today's New Prospects" card at a capped rate alongside the
daily cron, never as a dump. Two additions worth making:

- **City clustering.** Give a rep a coherent geographic set, not scattered pins. The lat/lng is
  already in hand, so clusters are free to compute. A rep working 6 dealers in one metro in one
  day is a route; 6 dealers across 3 states is a wasted week.
- **Density ranking.** Cities with several Fuel dealers are worth a visit before cities with one.

### Phase 4 — Measure by batch

`Lead.importBatchId` already exists. Track contacted → quoted → first order **for this batch
specifically**, so the question "was scraping a competitor's dealer map worth it?" has a real
answer before the second brand gets scraped.

---

## 5. Tiering — what makes a row worth a call

Ranked, highest first. **Territory gates reachability; brand count ranks within it.** An earlier
draft of this section said the opposite — that brand count outranks territory, so a 4-brand dealer
two states away beats a 1-brand dealer down the road. That was wrong and is corrected here: per
§8.1 the non-home states get **no rep at all** in this phase, so a non-home dealer cannot be worked
through the rep queue however many brands it carries. Ranking it above a home-state dealer would
promote an unreachable lead over a workable one. The numbered ranks below are authoritative.

1. **Already a customer** → not a prospect. Wheel/tire cross-sell task to the owning rep (§8.4).
2. **Home state + 2 or more brands** (325 dealers) → the opening release. Field-visitable and
   provably serious about wheels.
3. **Home state, single brand, within ~150 miles of Orlando or Dallas** → best freight position.
4. **Home state, single brand, rest** → phone/email first.
5. **Non-home state with 3+ brands** → worth an inside-sales push regardless of distance; a
   4-brand dealer justifies an LTL lane on its own.
6. **High-density metro in a non-home state** → a cluster can justify a rep trip.
7. **Single dealer, far state** → email nurture only.
8. **Canada** → Qingdao motion, parked per §8.2.
9. **Blacklist / opted out** → never.

Rows carrying an email (29%) sort above otherwise-equal rows without one, since they can be
worked without spending an Apollo credit.

---

## 6. Where the real leverage is

Five things that make this "特别有效" rather than just a bigger pile of leads:

1. **Lead with the wheel relationship, not with tires.** They already buy wheels wholesale. The
   credible opening is cost on the wheel line or the tire that packages with it — not a generic
   tire pitch.
2. **Work the warehouse rings first.** Freight decides margin. The dealers Rhino can beat on
   landed cost are the ones near Orlando and Dallas, and 626 of them in the home states were
   invisible to the current prospecting radius.
3. **Mine the overlap for upsell, not outreach.** The dealers who are already customers are proof
   the motion works and the cheapest revenue on the list.
4. **Cluster into routes.** This list's unfair advantage over Places-collected leads is complete
   geographic coverage with coordinates. Use it for routing.
5. **Treat it as a repeatable play.** Moto Metal, XD, American Racing and the rest of the Wheel
   Pros brands run the identical locator software. If this batch converts, the same pipeline
   produces the next list in an afternoon. Build it once, parameterised by brand.

---

## 7. Anti-goals — what would make this a failure even if it "works"

- Reps cold-calling existing customers because the exclusion gate was skipped.
- 1,906 rows burying the daily cron's leads and killing a working habit.
- A rep assigned dealers in states Rhino cannot serve economically.
- Spending AI budget enriching 1,906 rows to work 200.
- Burning the list with a weak first touch — there is one chance at a cold intro.
- Any send that bypasses `isExcluded()` or the CAN-SPAM unsubscribe path.

---

## 8. Decisions — LOCKED by owner 2026-10-24

1. **The 922 orphans** → held as an email-nurture pool. **No rep assignment.** They are imported
   and scored but stay out of every rep queue until the Phase 1b sending engine exists.
2. **Canada's 194 + 105 international** → **parked.** Imported and routed to Qingdao for the
   record, but not worked. Revisit after Phase 4 numbers.
3. **Release rate → 5 per day.** Read as *5 per rep per day*, which matches the existing
   "🎯 Today's New Prospects" card (it already surfaces 5). This is the **total** for that card —
   dealer-list leads and daily-cron leads share the same 5 slots and compete on rank, so the cron's
   drip is never buried (blocker §2.4). It does not become 5 + 5.
4. **The already-customer overlap** → a **cross-sell task to the rep who already owns the
   account**, not a prospecting lead. Uses the existing `Task` model, never enters `/prospecting`.
5. **First cut → all home-state dealers**, not just Tier 1. Tiering (§5) therefore controls
   *release order within the home states*, not which rows get imported or enriched.
   ✅ RESOLVED 2026-10-24: owner reaffirmed the full home-state set after seeing corrected figures.
   An earlier draft of this item cited 1,579 home-state dealers (2.3× the original 685); that figure
   was wrong, because it was derived from the corrupt Country column. Counted by State, as the importer
   does, Phase 0 found 2,099 home-state dealers new to the CRM and 2,083 were imported, about 3× the
   original 685, and that is the scope the owner confirmed. §8.1's throughput estimate should be read
   against 2,083, not 685. Release is tier-ordered, so the 443 Tier 2 dealers still surface first and
   the Tier 3 and 4 dealers queue behind them.

6. **Customer classification** (owner, 2026-10-24) — extend `CustomerType`. `TIRE_SHOP` and
   `CAR_DEALER` already exist; add three:

   | Value | Covers |
   |---|---|
   | `WHEEL_SHOP` | what most of the 5,064 are; currently indistinguishable from tire shops |
   | `TRUCK_TIRE_SHOP` | TBR/commercial — the #1 campaign priority, today hidden inside `TIRE_SHOP` |
   | `ATV_GOLF` | the 383-dealer STEELENG golf-cart sheet plus UTV/ATV shops across the other brands |

   Additive enum change, so no existing row breaks. `Lead.type` uses the same enum, so the
   classification carries through on conversion automatically. **City/State/ZIP already exist on
   both `Customer` and `Lead` — no schema change there**; the gap the owner is describing is
   filter/group-by in the UI, which is a page change, not a migration.

### 8.1 Consequence of #3 + #5 — throughput

685 home-state dealers, minus whatever Phase 0 removes as existing customers, blacklisted or
already-leads, call the remainder **R**. At 5 slots per rep per day shared with the daily cron,
working time is roughly:

```
days ≈ R / (reps_in_location × 5 × cron_share)
```

Two things follow and both belong in the implementation plan:

- **Phase 0 must report R and the active SALES_REP head-count per location** before any release
  rate is fixed. If R is large relative to the rep head-count, the 685 take months to work and the
  freshest rows go stale at the back of the queue.
- **Tier order matters more than it would have at a smaller scope.** Because all 685 are in, the
  warehouse-ring dealers (§5 rank 2) must come off the queue first; the single-dealer far-corner
  rows in home states sit at the back.

If the arithmetic shows the 685 cannot be worked inside a reasonable window, the honest options
are: raise the per-rep rate, add reps, or cut the tail — not to import them and let them rot. The
plan should surface that number rather than quietly absorb it.

---

## 9. Build order, if approved

1. Reconciliation report (Phase 0) — read-only, no writes, answers "how many are actually new".
2. Website-resolution step for the enrichment gap (§2.2).
3. Importer: Excel → `ImportBatch` + `Lead`, gated, with territory routing and the orphan rule.
4. City-cluster + density ranking for assignment.
5. Release-rate control into "Today's New Prospects".
6. Batch reporting on `importBatchId`.

Steps 1 and 2 are worth doing regardless of what is decided about the rest — step 1 costs nothing
and step 2 makes every future scraped list usable.

---

## 10. Out of scope

- The Phase 1b outreach/sending engine (campaigns, Gmail, warmup, replies). Still blocked on the
  sending mailbox and queue-approver decisions recorded in the prospecting memo.
- Scraping additional brands. Deliberately deferred until this batch has Phase 4 numbers.
- Any change to the existing daily cron's behaviour.
