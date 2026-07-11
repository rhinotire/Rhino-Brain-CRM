# B2B + Consumer Lead Platform — Architecture Document

Date: 2026-07-11 · Status: DRAFT — awaiting William's review (master instruction §31: no production code until approved)
Spec: `docs/b2b-consumer-lead-platform-master-instruction.md` (the **addendum** wins over the body).

---

## Part I — Current State (read-only audit findings)

### 1. Existing RHINO BRAIN architecture

Turborepo + pnpm monorepo (root `pnpm-workspace.yaml`, `turbo.json`):

| Piece | Location | Notes |
|---|---|---|
| Internal CRM (RHINO BRAIN) | `apps/rhino-brain` | Next.js 14 App Router, server actions only (no REST layer except `src/app/api/export/[entity]/route.ts`) |
| Public website | `apps/website` | SSR/ISR, built in platform STEP 4; imports `@rhino/services` only |
| Database | `packages/database` | Single Prisma schema (`prisma/schema.prisma`, 30 models + 20 enums), real migration history since `0_init`; shared `db` singleton exported from `src/index.ts` |
| Service layer | `packages/services` | Trust-tier boundary. Public tier: `PublicCatalogService`, `PublicLeadService`. Internal: `ProductService`, `InventoryService` |
| Deployment | Vercel | CRM project `rhino-brain-crm` (Root Directory `apps/rhino-brain`); website project not yet created |
| DB hosting | Supabase Postgres | Prod uses pooler transaction mode 6543; migrations via session mode 5432 |

### 2. Existing reusable models (all in `packages/database/prisma/schema.prisma`)

| Model (line) | Reuse verdict for this platform |
|---|---|
| `Location` (182) | **REUSE as Company+Warehouse** — see §5. Has `name`, `city`, `shortTag`, `color`, `active` |
| `User` (204) | REUSE — internal staff, roles ADMIN/MANAGER/SALES_REP/ACCOUNTING (enum line 15). Never extended to external users |
| `Customer` (251) | **REUSE as the dealer-matching base** — 1,366 live records with `companyName`, `phone`, `contactCell`, `email`, `website`, `whatsapp`, `address/city/state/zip`, `tier` A–D, `assignedRepId`, `locationId`. This IS the "Existing Dealer" table from spec §11 |
| `Lead` (311) | REUSE for **dealer prospects** — pipeline stages (`PipelineStage` line 75), `assignedRepId`, `locationId`, `source` (already has `WEBSITE_QUOTE`/`WEBSITE_DEALER_APP`/`AI_ASSISTANT`), `meta Json` (migration 20260711200004). NOT reused for consumer lifecycle (addendum #2) |
| `Quote`/`QuoteItem` (406/438) | REUSE — wholesale quote opportunity linking (spec acceptance #23) |
| `Product` + `TireSpec`/`WheelSpec`/`PartSpec` + `ProductImage`/`ProductRelation` (553–715) | REUSE — public fields + `Visibility` enum already live (migrations 01–03); `visibility=PUBLIC` gate enforced in `PublicCatalogService` |
| `InventorySnapshot` (716) | REUSE — per-warehouse stock; public exposure only as buckets (`packages/services/src/public-catalog-service.ts`, `LIMITED_THRESHOLD`) |
| `Order`/`OrderItem` (728/746) | REUSE — first-order tracking for installer→dealer conversion |
| `Notification` (505) | REUSE — in-app per-user notifications (`type`,`title`,`link`,`read`) |
| `Task` (381) | REUSE — "sales representative receives a task" (acceptance #21) |
| `Activity` (353) | REUSE — audit-ish trail on customers/leads |
| `AiUsage` (785) | REUSE — AI assistant call logging |
| `Invoice`, `LostSale`, `ChatMessage`, `Tag`, `ImportBatch`, `CustomerDocument` | Not needed by this platform; untouched |

**Missing entirely (gap):** Installer, ConsumerLead, InstallerReferral, referral status history, consent, appointment request, ZIP geodata, server-side analytics events, coupon models, DealerAccount/DealerUser (planned in `docs/database-migration-plan.md` §4, not yet implemented).

### 3. Existing reusable APIs / services

- `PublicCatalogService.listPublished / getBySlug` (`packages/services/src/public-catalog-service.ts`) — PUBLIC-only reads, stock buckets, DTOs field-mapped; leak protection covered by `public-catalog-service.test.ts` (mandatory test).
- `PublicLeadService.createQuoteRequest / createDealerApplication` (`public-lead-service.ts`) — zod validation, per-IP in-memory rate limit (5/10min), least-loaded rep auto-assignment (`pickRep()`). **The rep-assignment + validation pattern is directly reusable for consumer leads.**
- `ProductService`, `InventoryService` — internal reads/writes.
- CRM server actions in `apps/rhino-brain/src/actions/*` — auth-gated mutations; pattern to follow for any new CRM surface.

### 4. Existing reusable UI components

- Website: `apps/website/src/components/chrome.tsx` (Header/Footer/MobileBar — mobile bar already has the 3-slot layout spec §6 wants), `product-card.tsx` (+`StockBadge`), `lead-forms.tsx` (useFormState forms with honeypot + pending states — template for ZIP/consumer forms), `json-ld.tsx`.
- Website libs: `site.ts` (SITE constants — to be replaced by brand config, §12 below), `articles.tsx`.
- CRM: `src/components/ui/primitives.tsx` (Table/Badge/StatCard), `toast.tsx`, toggle pattern (`web-publish-toggle.tsx`).

### 5. Current multi-company support

One shared DB, company = `Location` row (Rhino Tire USA/Orlando/FL and Everflow Tire/Dallas/TX — seeded in `packages/database/prisma/seed.ts`). Enforcement:

- `locationScope(session)` + `repScope(session, field)` in `apps/rhino-brain/src/lib/auth.ts` applied on every CRM list/report query (verified across `src/app/(app)/*/page.tsx`).
- Manual isolation fixes documented in git history (commits `f38d78f`, `1a13c10`, `7239b9a`) — company isolation is a **known fragile area**: it relies on every query author remembering the scope fragment.
- **No `Company`/`Brand`/`Territory` concept beyond Location.** Location currently conflates company + warehouse (1:1 today). Addendum #3: keep Location as the operational tenant, add a `BrandConfig` table for web-facing identity (domain, colors, copy, network name) rather than restructuring live CRM data. A company's second warehouse would later become a new Location linked via `BrandConfig.locationIds` — no CRM refactor needed now.

### 6. Current warehouse support

Warehouse == `Location` via `InventorySnapshot.locationId` (unique `[productId, locationId]`). Stock per warehouse queryable and already shown per-location in CRM (`apps/rhino-brain/src/app/(app)/products/page.tsx`) and summed into buckets publicly. Sufficient for routing "product availability at assigned warehouse".

### 7. Current lead / CRM support

Full pipeline: `Lead` → stages `NEW_LEAD…ACTIVE_CUSTOMER/LOST` (`PipelineStage`), kanban (`src/app/(app)/pipeline`), conversion to Customer (`convertedCustomerId/At`), activities, tasks, notifications, follow-up rules in `src/lib/domain.ts`. Website→CRM lead capture already works end-to-end (verified: STEP 4 lead tests). Source attribution via `CustomerSource` enum + `Lead.meta` JSON.

### 8. Current Dealer support

- "Dealers" today = `Customer` rows (tire shops etc.) with tier pricing A–D — spec §2's dealer base.
- **No dealer login / portal / DealerAccount / DealerUser** (planned: `docs/database-migration-plan.md` migration 4; schema not yet created). Dealer Portal is explicitly Phase 2 of the website platform (`docs/architecture.md`).
- Consequence: MVP dealer matching matches against `Customer`; "Dealer Login" CTAs link to a "coming soon / contact your rep" page until the portal ships.

### 9. Current product & inventory support

Catalog: 1,116 live products (prod count, 2026-07-11), publishable via the CRM "Web" toggle (`apps/rhino-brain/src/components/web-publish-toggle.tsx` → `ProductService.setPublished` — auto slug/name). Public catalog currently 0 published (owner decision pending). Category/size/product pages already exist in `apps/website`.

### 10. Current notification support

- In-app: `Notification` model + bell (`src/components/notification-bell.tsx`).
- Email: **none found** (no nodemailer/resend/sendgrid usage in either app) — email sending is a **new dependency decision** (§28).
- SMS/WhatsApp: none. Deferred to Phase 2 (addendum #12).

### 11. Current authentication & permissions

- Internal: JWT (jose) in httpOnly cookie `tirepro_session`, `SESSION_SECRET` fails hard in prod (`src/lib/auth.ts`); helpers `requireSession/requireManager/isManager/seesAllLocations`; middleware = cookie-presence gate (`src/middleware.ts`).
- Public website: anonymous; only `@rhino/services` public functions callable (no DB import — enforced by convention + `next.config.mjs` transpile list; a lint rule is a cheap hardening TODO).
- No external-party auth of any kind (dealer or installer) — the secure-token pattern (§15 below) is new but self-contained.

---

## Part II — Proposed Architecture

### 12. Dual-channel website architecture (spec §5–8, addendum #1)

**One codebase, brand by Host header.**

```
Request → middleware reads Host
  rhinotiresusa.com  → brand = RHINO   (locationTag FL, network "RHINO Local Installer Network")
  everflowtires.com  → brand = EVERFLOW (locationTag TX, network "EVERFLOW Preferred Dealer Network")
  localhost/preview  → ?brand= override for testing
```

- New `BrandConfig` DB table (§16) read once per request (cached): identity, domain, colors, phone/NAP, warehouse locationId(s), IDEAL priority on/off, service-radius config, navigation copy.
- `apps/website/src/lib/site.ts` becomes `brand.ts`: `getBrand()` from request headers; all components take brand from context instead of the SITE constant. Tailwind theming via CSS variables set in `layout.tsx` per brand.
- Header gets the two-path block (spec §5): business path (Search Wholesale Inventory / Dealer Login) + consumer path (Find Tires & Installation Near Me). Existing `MobileBar` becomes `[Search Tires][Find Installer][Call]`.
- Product page (`products/[slug]/page.tsx`) gains the consumer section: ZIP input + "Find a Store" + "Send This Tire to My Installer" alongside the existing wholesale CTAs. Dealer pricing remains absent by construction (PublicProductDTO).
- No audience popup; both CTAs always visible (spec §5, addendum #9).

SEO duplication control (spec §22.4): shared templates, per-brand `metadata` (titles/descriptions/emphasis copy from BrandConfig), per-brand canonical domain, separate sitemaps (already dynamic per request host).

### 13. IDEAL routing architecture (MVP-A)

IDEAL is an `Installer` row flagged `preferredInstallerStatus=OWNED` with `companyId` = Rhino FL location and configurable `serviceRadius` (default 25 mi — owner to confirm).

```
Consumer on product/size page enters ZIP
→ ZipCode table lookup (lat/lng)                     [invalid ZIP → inline error]
→ distance(consumerZip, installer.zip) ≤ serviceRadius AND installer.active
   AND category capability matches product.category
→ IDEAL qualified?
   YES → IDEAL option card: store info, hours, phone (click-to-call), directions link,
         [Request Installed Price] [Request Appointment]  (both create ConsumerLead)
         Same-day badge: NOT in MVP (needs verified appointment capacity — spec Hook 2)
   NO  → Partner installer search (MVP-B network; empty at MVP-A launch)
→ No installer → manual-fallback form ("We're locating an installer near you")
         → ConsumerLead status INSTALLER_NEEDED → sales task
```

- Distance: haversine over a local `ZipCode` table (free ZCTA centroid data imported once; ~33k rows) — no external API (addendum #4).
- Installed price: MVP always "Request Installed Price" (addendum #8); no retail price display anywhere until a pricing owner exists.
- Every submission creates `ConsumerLead` + CRM `Notification` + `Task` for the assigned recipient (owner decision §28: dedicated person vs rotation) + email (new dependency).

### 14. Preferred Installer Network architecture (MVP-B foundation, Phase 2 growth)

- `Installer` records created three ways: (a) manually by managers (new CRM Settings page), (b) from consumer referrals (§15) after verification, (c) later from dealer applications (spec §13 capability checkboxes — Phase 2).
- `dealer_account_id` → `customerId` link when the installer is an existing CRM customer; preserves `assignedRepId` (spec §18 rule).
- Ranking (MVP-B): filter hard requirements (active, capability, radius), then score = distance + dealer-status bonus + response score (response score starts neutral; instrumented from referral accept latency). Distance never sole factor (spec §9-P2).
- Public installer pages, portal, badges: Phase 2 (spec §26). Schema fields (`publicPageEnabled` etc.) included now so no migration churn later.

### 15. Send This Tire to My Installer (MVP-B)

Flow (spec §11), mapped to concrete mechanics:

```
Product page → consumer form (consumer block + prefilled product block + installer block)
→ PublicReferralService.create():
   1. zod-validate; honeypot; per-IP rate limit (reuse public-lead-service pattern)
   2. create ConsumerLead (status SUBMITTED) + ConsumerConsent row (contact consent text + timestamp + IP)
   3. dealer matching against Customer + Installer tables:
        normalize phone (digits-only), domain from website/email, name similarity (pg_trgm or simple
        normalized-contains), zip proximity
        → EXISTING_DEALER | EXISTING_INSTALLER | POSSIBLE_DUPLICATE | NEW_PROSPECT
   4. create InstallerReferral (secureToken = 32-byte crypto random, expiresAt = 14 days)
   5. EXISTING_DEALER: keep assignedRepId; notify rep (Notification + Task + email)
      NEW_PROSPECT: create standard B2B Lead (source AI-free "CONSUMER_REFERRAL" — new enum value)
                    via least-loaded-rep assignment; sales contacts the shop manually (MVP)
   6. consumer gets tracking URL /request/{consumerToken} (separate token from installer's)
→ Installer page /shop-request/{secureToken}  (noindex,nofollow, no auth needed, token IS the auth)
   masked consumer ("William Y., ZIP 32809") + product + qty + preferred date
   [Accept] → status INSTALLER_ACCEPTED → unmask on next render; notify consumer + rep;
              draft Quote created for matched Customer (linked via referral.quoteId)
   [Decline] → status INSTALLER_DECLINED → back to routing/manual
   [Request Wholesale Price] [Contact Sales] → sales task
→ Consumer status page /request/{consumerToken}: step indicator from ReferralStatusHistory
→ No response in 3 business days → status escalated MANUAL_ASSISTANCE_REQUIRED → sales task
```

Uploads (business card/invoice/storefront photo): reuse the Supabase Storage pattern from `apps/rhino-brain/src/lib/storage.ts` (private bucket, size/MIME validation as in `uploadProductPhoto`, `src/actions/products.ts`). MVP can defer uploads to Phase 2 if needed — form works with name/phone/zip alone.

### 16. Proposed data model (new tables — all additive migrations)

```prisma
model BrandConfig {            // addendum #1/#3 — web identity per company
  id, key ("RHINO"|"EVERFLOW"), domain, name, legalName, phone, addressJson,
  colorsJson, networkName, locationId → Location, idealInstallerId?, active
}

model ZipCode { zip @id, lat, lng, city, state }   // ZCTA centroids, static import

model Installer {
  id, locationId → Location (owning company), customerId? → Customer (dealer link),
  storeName, legalName?, address/city/state/zip, lat?, lng?, serviceRadiusMi,
  phone, email?, website?, hoursJson?,
  capabilities: passenger/lightTruck/trailer/tbr/wheels/mobile booleans, maxWheelSize?,
  appointmentEnabled, sameDayEnabled, preferredStatus (OWNED|PREFERRED|PARTNER|PROSPECT),
  assignedRepId? → User, responseScore Int default 0, publicPageEnabled false,
  active, createdAt, updatedAt
  @@index([zip]) @@index([locationId, active])
}

model ConsumerLead {
  id, brandKey, sourceUrl, campaignId?,
  name, phone, email?, zip, vehicleJson?, preferredContact, preferredDate?,
  productId? → Product, tireSize?, quantity,
  kind (INSTALLED_PRICE|APPOINTMENT|INSTALLER_NEEDED|SEND_TO_INSTALLER),
  status (ConsumerLeadStatus enum — spec §19 list),
  installerId? → Installer, locationId? → Location, assignedRepId? → User,
  consumerToken @unique, crmLeadId? → Lead (bridge, addendum #2),
  createdAt, updatedAt
  @@index([status]) @@index([zip]) @@index([createdAt])
}

model InstallerReferral {
  id, consumerLeadId @unique → ConsumerLead, installerId? → Installer,
  rawName?, rawPhone?, rawAddress?, rawZip?, rawWebsite?, uploadPaths Json?,
  matchStatus (EXISTING_DEALER|EXISTING_INSTALLER|EXISTING_PROSPECT|POSSIBLE_DUPLICATE|NEW_PROSPECT),
  matchedCustomerId? → Customer, secureToken @unique, expiresAt,
  status (ReferralStatus enum), quoteId? → Quote,
  contactedAt?, openedAt?, acceptedAt?, declinedAt?, completedAt?, createdAt, updatedAt
}

model ConsumerConsent { id, consumerLeadId, kind (CONTACT|SMS), textShown, ip, createdAt }

model ReferralStatusHistory { id, consumerLeadId, from, to, actor (system|userId|installer|consumer), reason?, createdAt }

model AnalyticsEvent { id, event, brandKey?, zip?, productId?, consumerLeadId?, meta Json?, createdAt
  @@index([event, createdAt]) }                     // addendum #6 — powers spec §23 reports
```

Enum additions: `CustomerSource` += `CONSUMER_REFERRAL`; new `ConsumerLeadStatus`, `ReferralStatus`, `InstallerPreferredStatus`, `ConsumerLeadKind`, `ReferralMatchStatus`.
Deferred (Phase 2+, no schema now): coupons, reviews, appointments-calendar, installer portal auth, DealerAccount/DealerUser.

### 17. Proposed service/API surface (all in `packages/services`, no raw DB access from website)

Public tier (anonymous callers, all rate-limited + zod-validated):

- `PublicInstallerService.findOptions({ zip, productId|tireSize, brandKey })` → IDEAL card | up-to-3 partners | none (no exact stock counts, no pricing)
- `PublicConsumerLeadService.createInstalledPriceRequest / createAppointmentRequest / createInstallerNeeded / createSendToInstaller` → `{ consumerToken }`
- `PublicConsumerLeadService.getStatus(consumerToken)` → masked status timeline
- `PublicReferralService.getForInstaller(secureToken)` (masked until accepted) / `accept(secureToken)` / `decline(secureToken, reason?)` / `requestWholesalePrice(secureToken)`
- `recordEvent(event, meta)` → AnalyticsEvent (allow-listed event names from spec §23; no PII in meta)

Internal tier (CRM server actions): installer CRUD, consumer-lead list/detail/assign/status, referral oversight, coverage-gap report (ZIP demand with no installer).

### 18. Proposed routes & UI components (`apps/website`)

| Route | Template |
|---|---|
| `/find-installation` | ZIP + tire-size search → options (new) |
| `/products/[slug]` | + consumer conversion block (edit existing) |
| `/tires/[sub]/[size]` | + "Find installation for this size" CTA (edit) |
| `/request/[consumerToken]` | consumer status page (new, noindex) |
| `/shop-request/[secureToken]` | installer secure page (new, noindex) |
| `/installers/[city]/[slug]` | Phase 2 public installer pages |
| CRM: `/installers`, `/consumer-leads` | internal management pages (new) |

New components: `ZipSearchForm`, `InstallerOptionCard`, `SendToInstallerForm` (3-step progressive), `ReferralStatusTimeline`, `BrandProvider`. All reuse the `lead-forms.tsx` patterns (useFormState, honeypot, mobile-first inputs).

### 19. Proposed AI tool functions (Phase 2 for consumer path; documented now per spec §15)

Existing CRM assistant (`src/actions/ai.ts`, `@anthropic-ai/sdk`) stays internal. Website AI assistant (later) gets tools only: `search_public_catalog`, `find_installation_options(zip, size)`, `create_consumer_lead`, `start_send_to_installer` — all wrapping the public services above, so the AI physically cannot fabricate inventory/pricing/availability (spec §15 "must call approved tools").

### 20. Security model

- Tokens: 32-byte `crypto.randomBytes` base64url; consumer and installer tokens distinct; `expiresAt` enforced server-side; single-active-token per referral; token pages `noindex,nofollow` + `X-Robots-Tag`.
- AuthZ: all reads/writes behind service functions that take the token/session as the ONLY capability; company isolation via `locationId` scoping in every internal query (same pattern as `locationScope`).
- Rate limiting: reuse `rateLimited()` per IP+route; plus per-token attempt counters for `/shop-request` (lockout on guess attempts — tokens are 256-bit so guessing is theoretical, but log it).
- Uploads: private bucket, MIME/size allowlist, no execution, served only via short-lived signed URLs to authorized CRM users.
- Pricing: consumer surfaces render from `PublicProductDTO`/installer DTOs only — existing leak tests extended to new DTOs (installer DTO must never include `cost/priceA–D/creditLimit/paymentTerms/notes`).
- Tests (spec §29 security list) all live in `packages/services` vitest + `apps/website` playwright, following the STEP 5 suites.

### 21. Privacy model

- Consumer PII: never in URLs (tokens only), never in AnalyticsEvent.meta (event carries zip/productId only), masked name ("First L.") + ZIP-only on installer pages until acceptance; consent row (text shown + timestamp + IP) required before any outreach; access to unmasked data logged via ReferralStatusHistory actor entries.
- Data access: CRM consumer-lead pages scoped by company (`locationId`) like every other CRM surface.
- Retention: referrals auto-expire (14 days) → status EXPIRED; no automatic deletion in MVP (owner may set policy later).
- TCPA: SMS deferred; consent schema ships now so Phase 2 SMS has proof-of-consent from day one (addendum #12).

### 22. SEO structure

- Per-brand domains with self-canonical pages; shared templates, differentiated copy per BrandConfig (RHINO: FL wholesale emphasis; EVERFLOW: Dallas inventory emphasis — spec §22.1/2).
- Consumer additions to product pages are content-additive (installation options block) — no new near-duplicate pages.
- `/find-installation` is one indexable page per brand; token pages noindexed; installer public pages (Phase 2) get `LocalBusiness` JSON-LD with verified NAP only.
- Existing sitemap/robots/llms.txt (`apps/website/src/app/sitemap.ts`, `robots.ts`) extended: robots additionally disallows `/request/` and `/shop-request/`.

### 23. Analytics events

MVP emits (server-side into AnalyticsEvent + GA4 client event where applicable):
`consumer_path_selected, business_path_selected, installation_search_started, installation_search_completed, ideal_match_found, installer_match_not_found, installed_price_requested, appointment_requested, send_to_installer_viewed/started/completed, existing_dealer_matched, new_installer_prospect_created, installer_request_opened, installer_accepted, installer_declined, referral_expired` — names exactly per spec §23 list.
Reports (CRM, Phase MVP-B+): leads by ZIP/product/brand, IDEAL conversion, dealer-match rate, **ZIP-demand-without-installer** (the dealer-recruitment map) — all simple GROUP BYs over AnalyticsEvent + ConsumerLead.

### 24. MVP implementation plan

**MVP-A — IDEAL funnel** (one step per commit, tsc/build/tests green each):
1. Migration 5b: BrandConfig, ZipCode, Installer, ConsumerLead, ConsumerConsent, ReferralStatusHistory, AnalyticsEvent (+enums). Seed: 2 BrandConfigs, IDEAL installer, ZIP import script.
2. `packages/services`: PublicInstallerService (IDEAL-only routing) + PublicConsumerLeadService + event recording (+ vitest incl. new leak tests).
3. Website: brand-by-host plumbing (BrandProvider, brand.ts) — RHINO domain unchanged visually; EVERFLOW renders with its config.
4. Website: dual-channel header/homepage blocks + `/find-installation` + product-page consumer block + consumer forms + status page (playwright + 360px checks).
5. CRM: consumer-leads list/detail page (company-scoped) + notifications + tasks; email adapter (single decision: Resend vs SMTP — owner).
6. Completion report per spec §30.

**MVP-B — Send to My Installer:** 7. InstallerReferral migration + matching service (+tests: match/duplicate/new). 8. `/shop-request/[token]` + accept/decline + masking + quote draft link. 9. Consumer status timeline + expiry job (Vercel cron) + escalation tasks. 10. Report.

Estimated: MVP-A ≈ 6 commits, MVP-B ≈ 4 commits, each independently shippable behind the existing preview-then-merge workflow.

### 25. Expected files to change

- `packages/database/prisma/schema.prisma` + 2 new migration folders; `seed.ts` (brands, IDEAL, sample installers)
- `packages/services/src/`: +`public-installer-service.ts`, `public-consumer-lead-service.ts`, `public-referral-service.ts`, `analytics.ts`, `geo.ts` (+tests)
- `apps/website/src/lib/`: `site.ts`→`brand.ts`; `src/components/`: chrome.tsx edit + ~5 new; `src/app/`: `find-installation/`, `request/[token]/`, `shop-request/[token]/`, product/size page edits, robots/sitemap edits
- `apps/rhino-brain/src/app/(app)/`: +`installers/`, +`consumer-leads/`; `src/actions/`: +`installers.ts`, +`consumer-leads.ts`; sidebar nav edit
- No changes to existing CRM workflows (acceptance #35): auth, pipeline, quotes, products, imports untouched.

### 26. Expected database migrations

Two additive migrations (MVP-A, MVP-B). No column renames/drops; all new tables + 1 enum extension (`CustomerSource += CONSUMER_REFERRAL` — same safe `ALTER TYPE ADD VALUE` pattern as migration 20260711200004). ZipCode bulk import runs as a script (not a migration) to keep migration replay fast. Rollback: new tables are leaf tables — dropping them cannot orphan existing CRM data; enum value addition is permanent but harmless (Postgres cannot drop enum values — acceptable, documented).

### 27. Risks and rollback plan

| Risk | Mitigation / rollback |
|---|---|
| Consumer flows break existing website | New routes are additive; product-page block behind a brand flag; revert = single commit revert, no migration rollback needed |
| Duplicate installer/dealer records | Matching is conservative: POSSIBLE_DUPLICATE routes to Sales Review, never silent creation (spec §11) |
| Wrong-company lead routing | Routing derives company from BrandConfig.locationId — one code path, unit-tested; cross-company moves are manual-only (spec §18) |
| Token leakage | 256-bit tokens, expiry, noindex, no PII until accept; worst case = one referral's product+ZIP visible |
| Email deliverability (new dependency) | Start with transactional provider + single sender domain; all notifications also exist in-app so email failure never loses a lead |
| In-memory rate limit resets per serverless instance | Acceptable MVP (same as current forms); durable limiter listed for Phase 2 |
| Live DB migrations | Same protocol as migrations 01–04: additive, `migrate deploy`, drift check before/after, scratch-schema replay test |

### 28. Business decisions requiring owner approval

1. **everflowtires.com** — confirm ownership + final domain; needed before brand-by-host ships (RHINO alone works meanwhile).
2. **IDEAL service radius** — default 25 mi? (configurable per installer).
3. **Consumer-lead recipient** — dedicated person (recommended: whoever runs IDEAL's counter) vs. existing rep rotation.
4. **Email provider** — Resend (recommended, simple) vs. existing SMTP; sender domain (e.g. notifications@rhinotiresusa.com).
5. **IDEAL's exact NAP + hours** — needed for the IDEAL option card and later LocalBusiness schema.
6. **Referral expiry window** — 14 days proposed.
7. **When to publish first products** — consumer funnel needs `visibility=PUBLIC` products to be useful (CRM "Web" toggle already live).

---

*Every conclusion in Part I cites the file/model/line inspected. Nothing in this document has modified RHINO BRAIN — production code starts only after William approves this plan (master instruction §31).*
