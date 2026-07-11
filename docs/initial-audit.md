# Initial Project Audit — RHINO TIRES USA Website Platform

Date: 2026-07-11 · Status: COMPLETE — satisfies the mandatory pre-build audit required by CLAUDE.md §2 and the Development Handbook.

## 1. RHINO BRAIN Repository Audit (`tirepro-crm`)

### Technology stack
- Next.js 14 App Router, TypeScript (strict), Tailwind CSS 3
- Prisma 5 + PostgreSQL
- Auth: custom JWT via `jose`, httpOnly cookie `tirepro_session` (`src/lib/auth.ts`)
- Validation: zod (`src/lib/validations.ts`); CSV: papaparse
- No test framework, no shadcn/ui, no REST API layer (server actions only, except `src/app/api/export/[entity]/route.ts`)

### Repository structure
```
prisma/schema.prisma      19 models, 15 enums (570 lines)
src/lib/auth.ts           requireSession, requireManager, repScope, locationScope, defaultLocationId
src/lib/domain.ts         temperature rules, quote follow-up rule, lead first-contact rule, scoring
src/actions/*.ts          server actions: auth, customers, leads, quotes, tasks, activities
src/app/(app)/*           authenticated pages (dashboard, customers, pipeline, quotes, reports…)
src/components/*          forms, kanban, CSV importer, UI primitives
src/middleware.ts         cookie-presence gate only (verification server-side — acceptable)
```

### Auth and roles
- Roles: ADMIN / MANAGER / SALES_REP. Rep scoping via `repScope()`, location scoping via `locationScope()` — Prisma where-fragments applied on every list query. Pattern is sound and REUSABLE.
- No dealer-facing (external) auth exists. Dealer Portal needs a separate credential space — do NOT add dealers to the internal `User` model.

### Business models (all in `prisma/schema.prisma`)
| Model | Verdict for website project |
|---|---|
| Location (Rhino FL, Everflow TX) | REUSE as-is |
| User (internal staff) | REUSE internal only; never extend to dealers |
| Customer (tiers A–D, temperature, tireguruId) | REUSE — dealer accounts link to Customer |
| Lead (pipeline NEW_LEAD→…→ACTIVE_CUSTOMER) | REUSE — website quote/dealer forms create Leads |
| Quote / QuoteItem | REUSE — website quote requests become Quotes |
| Product (sku, brand, category, sizeSpec, cost, priceA–D) | EXTEND — too thin for public pages (see database-migration-plan.md) |
| InventorySnapshot (product × location, upsert) | REUSE — drives public stock status |
| Order / OrderItem (Tire Guru CSV import) | REUSE |
| Activity, Task, Opportunity, Notification, Tag, ImportBatch, CustomerDocument | REUSE (internal) |

### Key asset discovered
`Product.priceA/B/C/D` tier pricing already exists and maps directly to dealer-tier pricing for the Dealer Portal. Do not build a new pricing system.

### v2 upgrade status (UPGRADE-PLAN.md)
Phases 1–3 complete (DB foundation, multi-location, branding). Phases 4–7 pending: customer documents (Supabase Storage), product catalog pages, orders import + purchase alerts, AI assistant.

### Security findings (fix during Phase 1)
1. `SESSION_SECRET` falls back to `"dev-secret-change-me"` — must fail hard in production instead.
2. Seed users all use password `demo1234` — rotate before any shared deployment.
3. No rate limiting — required on public forms and AI endpoints.
4. No automated tests — add Vitest + Playwright during monorepo setup.

### Technical debt
- All data access via server actions importing Prisma directly. Fine for the internal app; public apps must go through the shared services package (architecture.md).
- Inventory is snapshot-based (CSV overwrite). Public site must show status buckets (In Stock / Limited / Contact for Availability), never exact real-time counts.

## 2. Existing Website Audit (www.rhinotiresusa.com)

- Homepage and `/sitemap.xml` return EMPTY content to non-JS crawlers → site is client-side rendered. Search engines and AI engines see a blank page. This is the single largest traffic problem and alone justifies the SSR/ISR rebuild.
- PENDING (non-blocking for Phase 1 start): rendered crawl for the 301 redirect map and reusable-asset inventory. Must be completed before launch.
- NAP consistency (name/address/phone/hours) across site, Google Business Profile, and social profiles must be standardized. Note: brand appears as both "Rhino Tire USA" and "Rhino Tires USA" (domain is rhinotiresusa.com) — pick ONE canonical business name everywhere.

## 3. Audit Conclusions

1. **Reuse:** stack, auth pattern, Location/Customer/Lead/Quote/Order/InventorySnapshot models, tier pricing, CSV import infra, domain rules.
2. **Refactor/extend:** Product model (additive migration: full tire/wheel/part attributes, images, slug, visibility); extract business logic from `src/actions/*` into a shared services package.
3. **Missing (build new):** public website app, dealer portal app, shared services package, search index, content model for Knowledge Center, SEO infrastructure, AI tool layer, dealer auth.
4. **Out of MVP:** payments/checkout, freight automation, image recognition, predictive inventory.
5. **Safest integration architecture:** monorepo, shared database + services packages, three apps at different trust tiers (architecture.md). No duplicate Product/Inventory/Customer/Lead/Quote/Pricing/User/Supplier systems needed — CLAUDE.md §2 constraint satisfied.
