# Everflow Website — Phase 1 Audit & Architecture Plan

> Created 2026-07-22. Master instruction + owner Q&A live in `Desktop\EVERFLOW WEBSITE\`.
> Owner-confirmed decisions: address **5091 Pulaski St, Dallas, TX 75247**; domain **everflowtireusa.com**;
> built as the **second brand deployment** of `apps/website` (BRAND_KEY=EVERFLOW), maintained through the CRM;
> **real product data only** — no demo content.

## 1. Audit: what already exists

The brand-per-deployment architecture (addendum #1) is live in `apps/website`:

- `src/lib/brand.ts` — `BRAND_KEY` env → `BrandConfig` DB row (name, phone, NAP, logo, hero) with 60s cache and static fallback. Chrome already renders an EVERFLOW logo variant (`chrome.tsx:66`).
- Seed already has an `EVERFLOW` BrandConfig row (`packages/database/prisma/seed.ts:55`) — currently `active: false` with placeholder data.
- The homepage is already **B2B wholesale-first** (dealer pricing hero, tier pricing, dual B2B/consumer journeys, Hot/Deals/New merchandising) — it matches the Everflow master instruction's positioning far more than expected.
- Existing routes cover most of the master instruction's required pages:

| Master instruction page | Existing route | Status |
|---|---|---|
| Home | `/` | exists — needs brandization (see gaps) |
| Products + filters | `/tires`, `/tires/by-size`, `/tires/[sub]`, `/wheels` (bolt-pattern filter), `/packages`, `/parts`, `/supplies` | exists, real data |
| Product detail | `/products/[slug]` | exists |
| Commercial Tires landing | `/tires/commercial-truck` (category sub-page) | partial — instruction wants a fleet-focused landing page w/ lead capture |
| Trailer Tires & Wheels | `/tires/st-trailer` + `/packages` | partial — instruction wants a manufacturer-focused landing |
| Wheels | `/wheels` | exists |
| Dealer Program | `/become-a-dealer` | exists |
| Fleet Solutions | — | **missing** |
| About Us | — | **missing** |
| Service Area (DFW) | — | **missing** |
| Request a Quote | `/quote` | exists |
| Contact | — | **missing** (footer covers partially) |
| Resources / Learning Center | `/knowledge`, `/knowledge/[slug]` (brand-scoped articles from CRM) + `/tools/*` (10 calculators) | exists |
| Legal pages | — | **missing** |
| Dealer portal foundation | `/dealer/login`, `/dealer/quick-order` | exists |
| Lead system | `/quote`, `/become-a-dealer`, `/send-to-installer`, consumer actions — all brand-tagged (`brandKey`), rate-limited, stored in the shared CRM DB | exists |
| SEO plumbing | `sitemap.ts`, `robots.ts`, JSON-LD components, per-brand articles | exists — per-brand URL handling needs verification |

**Nothing needs to be built from scratch.** The work is (a) brandization gaps, (b) 4–5 missing pages, (c) Everflow launch config.

## 2. Gaps (the actual work)

### 2.1 Brandization gaps — Rhino/Florida copy hard-coded

1. **Static `metadata` exports hard-code Rhino** — e.g. `app/page.tsx:11` title "Rhino Tire USA — …", description "Same-week delivery in Florida". Must become `generateMetadata()` reading `getBrand()` / SITE env. Audit every page's metadata for the same issue.
2. **`src/lib/site.ts`**: `SITE.name/legalName/description` are Rhino constants (url/phone/address are already env-overridable). Either add env overrides for name/legalName/description or derive SITE from BrandConfig at build/request time. Sitemap + canonicals + JSON-LD all flow from `SITE.url`, so per-deployment env (`NEXT_PUBLIC_SITE_URL=https://www.everflowtireusa.com`) mostly works today.
3. **Florida-specific copy in components** — hero stat band ("Same-week delivery runs across Florida"), dual-journey card ("weekly Florida restock runs"). These must switch on `brand.key` or move into BrandConfig-driven strings (preferred: a small `brandCopy` map keyed by BRAND_KEY, kept in one file).
4. **Organization/LocalBusiness JSON-LD** — verify it reads brand NAP, not SITE constants.

### 2.2 EVERFLOW launch config (data, not code)

Update seed + production BrandConfig row:

- `domain`: `everflowtires.com` → **`everflowtireusa.com`**
- `legalName`: → **EVERFLOW TIRES & WHEELS LLC**
- `phone`: placeholder → **+19033376132** / display **(903) 337-6132**
- `addressJson`: → **5091 Pulaski St, Dallas, TX 75247** (owner-confirmed; the 11220B Petal St address in the master instruction is WRONG — never use it)
- `contactEmail`: **everflowtire@gmail.com** (upgrade to info@everflowtireusa.com once the domain email exists)
- `active`: true at launch

New Vercel project on the same repo: `BRAND_KEY=EVERFLOW`, `NEXT_PUBLIC_SITE_URL`, phone/address env vars per `site.ts`.

### 2.3 New pages (Everflow-driven, but shared — Rhino gets them too where sensible)

1. **`/fleet-solutions`** — fleet lead form (fleet type, vehicle count, sizes, monthly demand, service area, challenges). New lead form variant on the existing lead system.
2. **`/commercial-tires`** (or enrich `/tires/commercial-truck`) — steer/drive/trailer/all-position positions, fleet-oriented copy, commercial quote CTA. Prefer enriching the existing category page over a duplicate route (avoids cannibalized SEO).
3. **`/trailer-tires-wheels`** landing (or enrich `/tires/st-trailer`) — trailer-manufacturer messaging, mounted assemblies, factory supply pricing CTA. Same enrich-over-duplicate rule.
4. **`/about`** — factual, no invented history (per instruction §6.9).
5. **`/service-area`** — one DFW page listing cities; no doorway pages.
6. **`/contact`** — brand NAP, map embed, hours only if configured.
7. **Legal pages** — privacy, terms, product disclaimer, accessibility statement; mark attorney-review sections. Shared templates, brand-substituted.

### 2.4 CRM side (so "maintained through the CRM" holds)

- Brand-scoped article authoring already exists; confirm Everflow articles can be created/assigned in rhino-brain.
- BrandConfig editing UI (logo/hero/NAP) — verify `website-brand.ts` actions cover EVERFLOW row.
- **Company isolation**: Everflow website leads must land scoped to the Everflow location (existing rule — verify `brandKey` → location mapping in lead intake).

## 3. Design tokens

Keep the existing design system (navy/steel/white — already matches the instruction's "deep navy, bright surfaces, industrial"). One decision for the owner: Everflow accent color. Current `--brand` is Rhino gold; options: keep gold (fastest, shared components untouched) or introduce a per-brand accent via CSS variables set in the root layout from `brand.key` (small, clean). Recommendation: **per-brand CSS variable accent, Everflow = industrial blue**, since the instruction asks for "deep navy, blue, charcoal" and visual differentiation between the two sites is cheap here.

## 4. SEO strategy (per deployment)

- Each deployment gets its own domain, sitemap, robots, canonicals via `NEXT_PUBLIC_SITE_URL` — no cross-brand duplicate-content risk at the domain level, but **shared product pages will have near-identical content on two domains**. Mitigation: brand-specific intro copy blocks on category pages, and don't launch Everflow with an identical knowledge library (assign distinct articles per brand — the article system already supports this).
- LocalBusiness schema: Everflow = Dallas NAP (5091 Pulaski St); keyword themes from instruction §9 (wholesale tires Dallas, trailer tire distributor Texas, …) drive the new landing/service-area page copy.
- Google Business Profile (off-site, owner task): create/claim with exactly the same NAP.

## 5. Phased task list

- **Phase A — Brandization** ✅ DONE 2026-07-22: `src/lib/brand-copy.ts` centralizes every brand/warehouse/delivery string, selected at build time (metadata stays static — no `generateMetadata()` needed since BRAND_KEY is fixed per deployment). 20+ files rewired; hero SVG sidewall lettering brandized; `brand.ts` FALLBACK now brand-keyed; seed EVERFLOW row corrected (everflowtireusa.com, 903 phone, 5091 Pulaski St). Verified in browser: Rhino renders byte-identical; EVERFLOW dev run shows Dallas copy everywhere incl. client components. ⚠️ Deployment note: the EVERFLOW Vercel project must set **both** `BRAND_KEY` and `NEXT_PUBLIC_BRAND_KEY` (client bundles only inline `NEXT_PUBLIC_*`). ⚠️ Production BrandConfig DB row must be updated via CRM/script — the seed upsert has `update: {}` and won't touch an existing row.
- **Phase B — Everflow config**: seed/BrandConfig update, per-brand accent variables, Everflow logo/hero placeholders in CRM.
- **Phase C — New pages** ✅ MOSTLY DONE 2026-07-22: `/about` (GEO-structured: who-we-serve / products-we-supply / why-choose), `/contact` (brand NAP + Google Maps embed + directions, no hours until configured), `/service-area` (brand-conditional city list — FL for RHINO, 20 DFW cities for EVERFLOW; one page, no doorway pages), `/fleet-solutions` (landing + FleetForm → existing quote→Lead pipeline via `submitFleetInquiry`, no parallel lead model), `/legal/{privacy,terms,product-disclaimer,accessibility}` (shared legal layout, attorney-review notice). Footer: Fleet/Service Area links + legal row; `/become-a-dealer` now lists the installation-referral benefit (flywheel). Sitemap updated. `brandAddressLine()` helper dedupes Rhino's placeholder NAP. Category enrichment ✅ done: `/tires/commercial-truck` (fleet intro + "Buying for a fleet?" band → /quote + /fleet-solutions) and `/tires/st-trailer` (trailer-manufacturer intro + assemblies/factory-supply band → /quote, /packages, /become-a-dealer) via a `B2B_SECTIONS` map in the shared `[sub]` page; other categories stay plain. **Phase C complete.**
- **Phase D — Launch** 🚀 IN PROGRESS 2026-08-28:
  - ✅ Vercel project **everflow-website** created (`prj_ZEjrVqPs4Hlc9K6TYRHqdOBxmwgm`, team rhino-tire), Root Directory `apps/website`, framework Next.js — mirrors rhino-website.
  - ✅ 17 env vars set on production+preview: `BRAND_KEY`/`NEXT_PUBLIC_BRAND_KEY=EVERFLOW` (the latter as public Config type — CLI flags names containing KEY), `NEXT_PUBLIC_SITE_URL=https://www.everflowtireusa.com`, Everflow phone/address publics, shared `DATABASE_URL`/`SUPABASE_*`/`ANTHROPIC_API_KEY`, base Zoho creds (internal notifications only — Everflow's own mailbox still pending), fresh `DEALER_SESSION_SECRET`, `DISABLE_CRON=1`.
  - ✅ Cron single-runner guard: `/api/cron/referrals` no-ops when `DISABLE_CRON=1` so shared-DB maintenance runs only on the RHINO deployment.
  - ✅ Live DB BrandConfig EVERFLOW row updated via `upsert-platform-config.ts`: everflowtireusa.com, (903) 337-6132, everflowtire@gmail.com, 5091 Pulaski St Dallas TX 75247, `active: true`.
  - **Owner steps remaining**: (1) buy `everflowtireusa.com`, then in Vercel dashboard → everflow-website → Settings → Domains add `everflowtireusa.com` + `www.everflowtireusa.com` and follow the DNS instructions shown (or transfer nameservers to Vercel); (2) create a GA4 property for Everflow and set `NEXT_PUBLIC_GA4_ID`; (3) create the Everflow Zoho mailbox → set `ZOHO_SMTP_USER_EVERFLOW`/`ZOHO_SMTP_PASS_EVERFLOW` on the CRM project (outbound quote emails) and optionally switch this project's base creds; (4) add Dallas-area installer records (brandKey=EVERFLOW network) so Find Installation returns options; (5) Google Business Profile with the exact NAP.
- **Phase AI-1 — AI sales assistant** ✅ SHIPPED 2026-07-22 (owner directive: "最新的模型，最先进最智能的AI网站"). Live on both brand deployments:
  - `src/app/api/assistant/route.ts` — streaming route, **Claude Opus 4.8** (`claude-opus-4-8`, override via `ANTHROPIC_ASSISTANT_MODEL`), adaptive thinking, effort `medium` (override `ANTHROPIC_ASSISTANT_EFFORT`), SDK tool-runner with a `search_catalog` tool over `PublicCatalogService` (real inventory, **no prices exposed** — quote-only by design). Safety rails per master instruction §12: no invented stock/pricing, no fitment guarantees, mandatory verification disclaimer, escalation to phone//quote, refusal handling. Rate limit 30 msg/10 min/IP (in-memory, per-instance). Analytics: `chat_assistant_started` / `chat_assistant_message` via `recordEvent`.
  - `src/components/assistant-widget.tsx` — floating chat (above mobile bar), streaming render via react-markdown, suggestion chips, logging-consent + fitment disclaimer in UI. Mounted in `layout.tsx`.
  - Brand-aware: system prompt built from `getBrand()` + `COPY`, so the EVERFLOW deployment automatically pitches Dallas NAP/dealer network.
  - Verified in browser against live DB: stock question returned real Grandforce ST205/75R15 SKUs with clickable product links; Chinese follow-up answered in Chinese without inventing load figures.
  - ⚠️ Deployment: website Vercel projects need `ANTHROPIC_API_KEY` (already in local `.env`). ⚠️ Known limitation: per-instance rate limiter (durable limiter tracked in STEP 5).
- **Deferred (documented, not built)**: dealer portal expansion, Spanish `/es`, Microsoft Clarity, conversation logging to DB (only aggregate events recorded today).

## 6. Owner decisions (2026-07-22, round 2)

- **Dual-channel, same as Rhino** — Everflow keeps the B2B + consumer dual-journey structure and the existing design system (gold accent stays; no per-brand accent for now).
- **Find Installation = flagship feature.** The strategic loop: consumers use Everflow's site to find installation at Dallas-network dealers → that routed demand is the headline benefit on the Dealer Program page ("we send installation customers to our network dealers"). Implications:
  - Homepage: keep/elevate the Find Installation journey for EVERFLOW.
  - `/become-a-dealer`: add "customer referrals from our installation finder" as a listed benefit.
  - Data prerequisite: Dallas-area installer/dealer records for brandKey=EVERFLOW must exist before launch (installer lookup is already brand-scoped).

## 7. Still open

1. Public brand list to display (GRANDFORCE confirmed in system; HEADWAY / APLUS / IMPACT to verify against DB).
2. Edward Henry named publicly on the site, or company contact only?
3. Slogan "Connecting Supply to the Road." — confirm final.
4. When the domain is purchased: set up domain email + Resend sending domain.
