# Competitor Benchmark — B2B Wholesale Tire Portals

Reviewed 2026-07-23 · Companion to competitor-benchmark-prioritytire.md (which covers the
D2C/SEO layer; this covers the transaction layer where Rhino's actual business lives).

## Who was benchmarked

| Company | Scale | What was reviewed |
|---|---|---|
| ATD (ATDOnline + ATDConnect + ATDMobile) | Largest US distributor | Public feature marketing |
| TireHub (TireHub Now) | Goodyear/Bridgestone JV | Programs & services pages |
| K&M Tire (Weblink 2.1 + Mr. Tire program) | Large Midwest wholesaler | Public pages + trade press |
| Tireweb Wholesale | SaaS platform sold TO tire wholesalers | Full public feature list — the closest thing to an industry-standard checklist |

## Build vs buy (asked 2026-07-23)

The big three run **in-house platforms** (their scale funds dev teams). Tireweb Wholesale
is the off-the-shelf SaaS for regional/mid-size wholesalers — real customers include
Atlantic Tire, Flynn's Tire, Purcell Tire, Ben Tire, STM (white-label dealer apps on
Google Play), claiming 30k+ dealers on platform.

Decision: **build**. Tireweb assumes it pulls stock/pricing from your POS/ERP — ours is
RHINO BRAIN, so buying still means building a full data-feed integration, plus SaaS fees
and their template. Our differentiators (multi-company shared stock, IDEAL routing,
Send-to-Installer, free-text quick order) don't fit their mold, and architecture.md
already reserves the dealer-portal layer over data we own. Tireweb remains the fallback
if a sub-brand ever needs a good-enough wholesale storefront fast. Its feature list
doubles as our table-stakes validation (below).

## Industry table stakes (every portal has these)

1. **Dealer login with tier pricing** — each account sees its own price, 24/7.
2. **Live inventory by warehouse** — quantity + which warehouse + delivery window
   ("local same-day" vs "2-day"). Multi-warehouse splits are standard.
3. **Order placement online** — cart, order confirmation, order tracking. Orders flow
   into the distributor's back office with no rekeying.
4. **Order history + one-click reorder** — the retention feature. Dealers reorder the
   same SKUs constantly.
5. **Built-in quoting** — dealer builds a quote for THEIR retail customer inside the
   portal (TireHub's wholesale↔retail flip view; K&M's quoting system).
6. **Search by size/brand/spec** — same search grammar we already built for the public site.
7. **Account & billing self-service** — invoices, statements, online bill pay on charge
   accounts (K&M), card/ACH at checkout (Tireweb Pay).

## Differentiators worth noting

- **TireHub — dual wholesale/retail view**: one click flips the screen to a retail-priced
  view the dealer can show their walk-in customer. Genius retention feature: the portal
  becomes the dealer's own sales tool, not just an ordering screen.
- **ATD/Tireweb — delivery-window commerce**: cutoff timers ("order by 4pm for same-day"),
  delivery windows on every line item. B2B buyers plan around fill rate + speed.
- **Tireweb — container/truckload modules**: bulk order flows separate from carton orders.
  Directly relevant to our pallet/container programs.
- **K&M — Mr. Tire / marketing program**: rebates, marketing packages, supplies pricing.
  Loyalty layer on top of commerce.
- **POS/ERP integrations** (all of them): orders and availability embedded in the dealer's
  own shop software (R.O. Writer etc.). This is where enterprise players win.

## Where Rhino/Everflow stands today (v2-platform)

| Table-stakes feature | Status |
|---|---|
| Dealer login + tier pricing | ❌ Login page is a "portal coming soon" placeholder (noindex). Prices A–D exist in DB, never exposed. |
| Live inventory by warehouse | ◐ Public site shows stock STATUS buckets only (by design). Per-warehouse quantities exist in CRM. |
| Online order placement | ❌ Quick Order is a lead form — a rep prices it manually and replies. |
| Order history / reorder | ❌ Orders live in CRM only; dealers have no view. |
| Dealer-side quoting | ❌ None. |
| Search by size/spec | ✅ Public catalog search is strong (size-normalize handles every input format). |
| Billing self-service | ❌ None (AR data exists in CRM). |

## Honest assessment

Rhino is a **rep-mediated wholesaler**: relationships + phone + quick-order form. That
works at current scale and loses nothing today — but every benchmarked competitor lets a
dealer check price and stock at 9pm and reorder in 30 seconds without calling anyone.
As dealer count grows, rep-mediated ordering becomes the bottleneck and the reason a
dealer consolidates purchases with ATD instead.

The good news: the hard data plumbing already exists (products, per-warehouse inventory,
tier prices, customers, orders — all in the CRM DB; architecture.md already reserves the
dealer-portal trust tier with DealerUser sessions and own-scope authorization).
The portal is a presentation + auth layer over data we already have.

## Current stack & migration strategy (owner input 2026-07-23)

Live operations run on **TireGuru POS** + TireGuru **TireLink** as the dealer portal.
Owner finds both mediocre and wants TireLink replaced, but fears migration risk.

Strategy — strangler pattern, never big-bang:
1. **TireGuru POS stays untouched** as the in-store system of record. Replacing a POS is
   the real surgery; it is out of scope indefinitely.
2. New portal replaces **TireLink only**, and launches **read-only** (tier prices + live
   stock, no ordering). A read-only surface cannot lose an order or corrupt books;
   TireLink keeps running in parallel as fallback.
3. Pilot with 2–3 friendly dealers before wide rollout.
4. Ordering comes later, and v1 orders flow into the CRM's existing human-confirmation
   path — reps still key confirmed orders into TireGuru. Digitize the order intake,
   keep the ledger where it is.
5. TireGuru retirement is a separate, much later decision.

**Source of truth (answered 2026-07-23):** TireGuru POS. CRM currently holds a manual,
incomplete export of it. TireGuru has **no public API** (verified — partner-only closed
integrations), but it demonstrably pushes live inventory to TireConnect/SimpleTire/
Solid Commerce, so export plumbing exists on their side. Data path, in order:
(A) request a scheduled inventory+pricing CSV feed from TireGuru support (paying
customer asking for their own data); (B) regardless of A, build a TireGuru-report →
CRM importer (existing repo pattern: import-real-data.ts) so the manual export becomes
a 5-minute full sync — this alone unblocks the read-only portal; (C) scripted web
export as last resort only. Mid-term: new products/pricing enter CRM first, demoting
TireGuru to in-store billing.

## Recommended build order (portal MVP, matches architecture.md Phase 2)

1. **DealerUser auth** linked to a CRM Customer (approval flow already exists via
   become-a-dealer → CRM).
2. **Logged-in catalog = public catalog + my price + real stock numbers** — reuse the
   public catalog pages, swap the DTO behind auth (server-side; prices never in public
   payloads, per architecture.md hard rule).
3. **Quick Order upgrade**: same paste-a-list UX, but parsed live (size-normalize),
   priced at tier, returns an orderable quote instead of "a rep will reply".
   This is our highest-leverage 差异化: nobody else's quick order accepts
   "ST235/80R16 LRE x 48" free text.
4. **Order history + reorder** from CRM order data.
5. Later: statements/bill pay · container/truckload module · dealer-side retail quoting ·
   delivery cutoffs. NOT now: POS integrations, loyalty programs (enterprise-scale plays).

## Sources

- atd.com service offerings, atdonline.com (ATDOnline / ATDConnect / ATDMobile)
- tirehub.com/tire-dealer-programs-services (TireHub Now, dual view, programs)
- kmtire.org, tirebusiness.com on Weblink (real-time inventory, quoting, bill pay)
- tireweb.com/wholesale (full B2B tire commerce feature checklist)
