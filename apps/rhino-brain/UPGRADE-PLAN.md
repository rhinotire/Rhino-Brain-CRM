# RHINO BRAIN CRM — v2 Upgrade Plan (for Claude Code)

## Context

This repo is `tirepro-crm`: a working Next.js 14 (App Router) + TypeScript + Tailwind + Prisma + PostgreSQL B2B inside-sales CRM for a US tire/wheel/trailer-parts wholesale business. It was fully built and verified (tsc 0 errors, eslint clean, `next build` passes). You are upgrading it to v2, rebranded **Rhino Brain — AI Business Command Center**.

The owner (William) runs TWO companies from one system:
- **Rhino Tire USA** — Orlando, FL
- **Everflow Tire** — Dallas, TX

Key existing facts you must respect:
- Auth: custom JWT (jose) session cookie `tirepro_session`, helpers in `src/lib/auth.ts` (`requireSession`, `requireManager`, `isManager`, `repScope`). Roles: ADMIN, MANAGER, SALES_REP.
- Rep scoping: `repScope(session, field)` returns a Prisma where-fragment limiting SALES_REP users to their own records. Every list page uses it.
- Business rules live in `src/lib/domain.ts`: customer temperature (Hot<7d / Warm<30d / Cooling 30-60d / Inactive 60-90d / Lost>90d), `quoteNeedsFollowUp` (sent 3+ days, no follow-up → virtual FOLLOW_UP_NEEDED), `leadNeedsFirstContact` (NEW_LEAD 3+ days no activity), `computeCustomerScore`.
- `Quote.decidedAt` and `Lead.convertedAt` exist and are stamped by actions; reports depend on them.
- Opportunity model uses `category / estMonthlyVolume / currentSupplier / targetPrice / competitorBrand / probability / nextAction` — NOT title/estimatedValue.
- Seed: `prisma/seed.ts`, demo password `demo1234`.
- CSV import uses papaparse client-side with camelCase header normalization (see `src/components/csv-importer.tsx`).

## Working rules

1. Work phase by phase, in order. After each phase: `npx tsc --noEmit` must pass with 0 errors, `npx next build` must pass. Git commit per phase with message `v2 phase N: <name>`.
2. Never break existing features. All existing pages keep working with location scoping added.
3. All UI text in English. Code comments in English.
4. Ask William before destructive DB operations. Schema changes go through `prisma migrate dev` (or `db push` if no migration history yet).
5. Sensitive data care: never log document contents; credit-card authorization and driver-license files are restricted (see Phase 4).

---

## Phase 1 — Database foundation ✅ COMPLETED (already in this codebase — verify, don't redo)

> Phase 1 was completed and verified (tsc 0 errors, `next build` passes) before this repo was handed off. The schema below is now LIVE in `prisma/schema.prisma` and `prisma/seed.ts` already seeds locations, TX reps (jake@/amy@everflowtire.com), 15 products, per-location inventory, and ~50 orders over 90 days including one purchase-decline pattern (Metro Car Superstore). Start your work at Phase 2.

Add to `prisma/schema.prisma`:

```prisma
model Location {
  id        String   @id @default(cuid())
  name      String                 // "Rhino Tire USA"
  city      String?                // "Orlando, FL"
  shortTag  String                 // "FL" — used in UI badges
  color     String   @default("#e8590c") // badge color
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  users     User[]
  customers Customer[]
  leads     Lead[]
  // quotes/tasks/activities/opportunities inherit location via customer/rep; ALSO add direct locationId to Quote, Task, Activity, Opportunity, Order for fast filtering
}
```

- Add `locationId String?` + relation to: User, Customer, Lead, Quote, Task, Activity, Opportunity (nullable first for migration, backfill in seed, then treat as required in app logic).
- ADMIN users have `locationId = null` (= all locations).

New Customer fields:
```prisma
  companyPhone   String?   // rename semantics: existing `phone` = company phone; add:
  contactCell    String?
  website        String?
  facebookUrl    String?
  instagramUrl   String?
  whatsapp       String?
```

New models:
```prisma
enum DocumentType { ACCOUNT_APPLICATION RESALE_CERTIFICATE DRIVER_LICENSE CREDIT_CARD_AUTH W9_FORM INSURANCE_CERT OTHER }

model CustomerDocument {
  id         String       @id @default(cuid())
  customerId String
  customer   Customer     @relation(fields: [customerId], references: [id], onDelete: Cascade)
  type       DocumentType
  fileName   String
  storagePath String      // Supabase Storage path
  fileSize   Int
  mimeType   String
  expiresAt  DateTime?    // resale certificate expiration
  sensitive  Boolean      @default(false) // true for DRIVER_LICENSE, CREDIT_CARD_AUTH
  uploadedById String
  uploadedBy  User        @relation(fields: [uploadedById], references: [id])
  createdAt  DateTime     @default(now())
}

model Product {
  id          String   @id @default(cuid())
  sku         String   @unique
  brand       String?
  category    ProductCategory
  sizeSpec    String?  // "ST205/75R15"
  description String
  cost        Decimal? @db.Decimal(10,2)
  priceA      Decimal? @db.Decimal(10,2)  // tier-A customer price
  priceB      Decimal? @db.Decimal(10,2)
  priceC      Decimal? @db.Decimal(10,2)
  priceD      Decimal? @db.Decimal(10,2)
  active      Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  inventory   InventorySnapshot[]
  orderItems  OrderItem[]
}

model InventorySnapshot {
  id         String   @id @default(cuid())
  productId  String
  product    Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  locationId String
  location   Location @relation(fields: [locationId], references: [id])
  quantity   Int
  snapshotAt DateTime @default(now())
  @@unique([productId, locationId])   // upsert on re-import (full overwrite)
}

model Order {
  id          String   @id @default(cuid())
  externalId  String?  @unique   // Tire Guru invoice #
  customerId  String
  customer    Customer @relation(fields: [customerId], references: [id])
  locationId  String
  location    Location @relation(fields: [locationId], references: [id])
  orderDate   DateTime
  total       Decimal  @db.Decimal(12,2)
  source      String   @default("TIREGURU_CSV")
  createdAt   DateTime @default(now())
  items       OrderItem[]
}

model OrderItem {
  id        String  @id @default(cuid())
  orderId   String
  order     Order   @relation(fields: [orderId], references: [id], onDelete: Cascade)
  productId String?
  product   Product? @relation(fields: [productId], references: [id])
  rawDescription String   // as it appears in the CSV, even if no product match
  quantity  Int
  unitPrice Decimal @db.Decimal(10,2)
  lineTotal Decimal @db.Decimal(12,2)
}
```

Also add `ImportBatch.entity` support for values: `PRODUCTS`, `INVENTORY`, `ORDERS`.

Update `prisma/seed.ts`: create the two Locations; assign Linda/Mike/Sarah/Carlos to Rhino FL; add 2 Everflow TX reps (Jake Miller, Amy Rodriguez) + backfill locationId on all seeded entities; add ~15 seed products (real tire SKUs like ST205/75R15, 11R22.5, 205/55R16 across categories, with A/B/C/D pricing), inventory rows per location, and ~25 orders spread over 90 days so purchase-trend logic has data.

Acceptance: migration applies cleanly on a fresh DB, seed runs, tsc + build pass.

## Phase 2 — Multi-location scoping ✅ COMPLETED (verify, don't redo)

> Completed and verified (tsc 0 errors, build passes): session carries locationId; `locationScope()` + `defaultLocationId()` in src/lib/auth.ts; every list/report/export query scoped; admin sidebar LocationSwitcher (cookie `tirepro_loc`); per-location dashboard summary cards; location badge column on customers list (admin @ All); location select on customer/lead/user forms; Locations management on Settings → Users; cross-location detail access blocked. Start at Phase 3.

- Extend `src/lib/auth.ts` session payload with `locationId`. New helper `locationScope(session)`:
  - ADMIN → `{}` (all), or `{ locationId: X }` when an explicit filter is chosen in UI
  - MANAGER / SALES_REP → `{ locationId: session.locationId }`
  - Compose with existing `repScope` (both apply for reps).
- Apply `locationScope` to EVERY list/report/export query (customers, leads, pipeline, quotes, tasks, activities, opportunities, dashboards, reports, CSV export API).
- Owner UI: location switcher in the sidebar (All Locations / per location), persisted in a cookie. When "All Locations", tables show a location badge column; dashboard shows a per-location summary card row (customers, open leads, pending quotes, won MTD) with drill-in.
- Admin Settings → Users page: manage locations (add/rename) and assign users to locations.
- New-customer / new-lead forms: location select for ADMIN (default = current filter); fixed for others. Reps dropdowns filter by selected location.

Acceptance: log in as manager@ → only FL data anywhere; owner sees both + switcher works; creating records lands in the right location.

## Phase 3 — Branding + full English ✅ COMPLETED (verify, don't redo)

> Done: logo at public/rhino-brain-logo.png (already in repo), sidebar + login rebranded RHINO BRAIN with logo image, gold brand palette (#e5a50a family) in tailwind.config.ts, app title updated, demo emails now owner@rhinobrain.com / linda@ mike@ sarah@ carlos@rhinotireusa.com / jake@ amy@everflowtire.com (seed + login hint + README). Start at Phase 4.

- Replace "TirePro CRM" branding with **Rhino Brain** everywhere (login page, sidebar, titles, README). Place the logo file at `public/rhino-brain-logo.png` (William will drop the PNG in; use an `<Image>` with dark background container). Accent color: gold `#e5a50a` for primary buttons/active nav (keep the rest of the slate palette).
- Audit ALL user-facing strings → English (they mostly are already; fix any leftovers).
- Login page demo accounts note updated with new domain emails (owner@rhinobrain.com etc. — update seed accordingly).

## Phase 4 — Customer profile v2 (documents + contacts)

- Customer detail page: add contact fields (company phone, contact cell, email, website, FB/IG/WhatsApp links) to profile card + edit form (update zod schema + server action).
- Documents section on customer detail:
  - Checklist UI of the 5 core types (Account Application, Resale Certificate, Driver License, Credit Card Auth, W-9) + Insurance Cert + Other; per-type status: Missing / On file / **Expired** (red, from `expiresAt`); header shows "N/5 on file".
  - Upload: client uploads to **Supabase Storage** (bucket `customer-docs`, private). Use `@supabase/supabase-js` with a server-side signed upload URL created in a server action (env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — server only, never exposed). Store metadata row in CustomerDocument.
  - Download: server action generates a short-lived signed URL. **Sensitive types (DRIVER_LICENSE, CREDIT_CARD_AUTH): only ADMIN and MANAGER can download; reps see status only.**
  - Delete: ADMIN/MANAGER only.
- Dashboard (owner/manager): "Expiring resale certificates" card — expired or expiring within 30 days.

## Phase 5 — Product catalog + inventory

- New pages: `/products` (searchable table: SKU, brand, category, size, tier prices, per-location stock; search matches sku/size/brand/description; manager can add/edit products), rep view is read-only.
- Quick stock lookup: global search box in the top bar (or on /products) optimized for size queries like "205/75" — this is the highest-frequency salesperson action.
- Quote form v2: line items gain a product search-select; picking a product auto-fills description/brand/size and the **unit price from the customer's tier column** (editable after). Show live stock for the quote's location next to the picker; warn (not block) if qty > stock.
- Import (Settings → Import): add **Products** and **Inventory** CSV importers.
  - Products: upsert by `sku`. Columns: sku (required), brand, category, size, description, cost, price_a..price_d.
  - Inventory: full overwrite per location. Columns: sku (required), quantity; location chosen in UI (or a `location` column). Unknown SKUs reported, not imported.

## Phase 6 — Orders import + purchase alerts

- Orders CSV importer (Tire Guru sales/invoice report): flexible header mapping (invoice #, date, customer name, item description, qty, unit price, total; tolerate one-row-per-line-item format by grouping on invoice #). Customer matching: by `tireguruId` first, then normalized phone, then case-insensitive company name; unmatched rows go to a review list where a manager assigns them (and the match is remembered via `tireguruId`).
- Customer detail: Order History section (date, total, items) + stats: lifetime value, last order date, avg monthly volume (last 90d vs prior 90d).
- **Purchase-decline alert**: computed flag when last-90d monthly average < 50% of the prior 90d average (min 3 historical orders). Surface on dashboard ("Revenue at risk" card), customer health report, and customer list as a badge. Update `computeCustomerScore` to factor order recency/volume when order data exists.

## Phase 7 — AI Assistant (Claude API)

- New page `/assistant` for all roles (scoped data). Server route `src/app/api/ai/route.ts` calling Anthropic Messages API (`@anthropic-ai/sdk`, env `ANTHROPIC_API_KEY`, model `claude-sonnet-4-6`). Never expose the key client-side.
- Three features, each a server action that assembles a compact context (only relevant records, never the whole DB):
  1. **Priority follow-ups**: deterministic pre-ranking (quotes needing follow-up, overdue follow-ups, Tier-A cooling, stale new leads, purchase-decline customers) → top 12 → Claude writes a one-line "why + how to approach" per item. Fallback: if no API key set, show the deterministic list with rule-based tips (feature still works).
  2. **Message generator**: pick customer + scenario (quote follow-up / reactivation / first touch / restock / container pitch / price objection) → context includes their recent activities, open quote w/ items, interests, last order → Claude drafts email + SMS/WhatsApp variants. Copy buttons.
  3. **Ask box**: free-form question; build context from aggregate stats + the relevant filtered lists (cap tokens); answer in the user's language (English or Chinese).
- Log AI calls (who, feature, tokens) in a simple `AiUsage` table for cost visibility.

---

## Final delivery checklist
- [ ] `npx tsc --noEmit` → 0 errors
- [ ] `npx next build` → success
- [ ] Fresh-DB test: migrate + seed + login as each role, click through every page
- [ ] README updated (env vars: DATABASE_URL, SESSION_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY; weekly CSV workflow documented)
- [ ] Git history: one commit per phase
