# Database Migration Plan — Product Extension + Dealer Auth

All migrations ADDITIVE and reversible (CLAUDE.md §15). Never rename/drop existing columns; existing CRM code must keep working untouched.

## Migration 1 — Product public-page fields

Add to `Product` (all nullable/defaulted):

```prisma
  slug            String?  @unique      // "st235-80r16-rhino-hd-14pr"
  name            String?               // display name for public pages
  pattern         String?               // tread pattern name
  visibility      Visibility @default(INTERNAL)  // INTERNAL | PUBLIC | DEALER_ONLY
  msrp            Decimal?  @db.Decimal(10,2)    // optional public reference price
  countryOfOrigin String?
  warrantySummary String?
  featuresJson    Json?                 // bullet features for product page
```

New enum: `Visibility { INTERNAL PUBLIC DEALER_ONLY }`. Existing rows default INTERNAL → nothing leaks publicly until explicitly published.

## Migration 2 — Category-specific attributes

One-to-one satellite tables (keeps Product lean, matches handbook Product Modeling):

- `TireSpec`: width, aspectRatio, rimDiameter, construction, plyRating, loadRange, loadIndex, speedRating, position, application, treadDepth32nds, maxLoadLbs, maxPressurePsi, rimWidthRange, overallDiameterIn, sectionWidthIn
- `WheelSpec`: diameterIn, widthIn, boltPattern, lugCount, centerBoreMm, offsetMm, backspacingIn, loadRatingLbs, finish, material
- `PartSpec`: partType, capacity, dimensions, material, mountingType, compatibilityNotes, certGrade

Indexes: `TireSpec(loadRange)`, `WheelSpec(boltPattern)` — these are the two highest-frequency B2B filters. Bolt pattern powers the self-built trailer wheel matcher.

## Migration 3 — Media and relations

- `ProductImage`: productId, url, alt (required — SEO), sortOrder, isPrimary
- `ProductDocument`: productId, type (SPEC_SHEET | LOAD_INFLATION | WARRANTY | BROCHURE), fileName, storagePath
- `ProductRelation`: productId, relatedProductId, type (COMPATIBLE_WHEEL | COMPATIBLE_VALVE | ALTERNATIVE | ASSEMBLY_COMPONENT) — powers "compatible wheel/valve" on product pages and the AI Tire Finder

## Migration 4 — Dealer Portal auth (Phase 2, schema can ship earlier)

- `DealerAccount`: customerId (unique FK → Customer), status (PENDING | APPROVED | SUSPENDED), priceTier (A|B|C|D — mirrors Customer.tier at approval), approvedById, approvedAt
- `DealerUser`: dealerAccountId, email (unique), passwordHash (bcryptjs, same as internal), name, role (OWNER | STAFF), active, lastLoginAt
- Separate session cookie (`rhino_dealer_session`) and separate auth helpers — never mix with internal `tirepro_session`.

## Migration 5 — Website lead capture

Extend `Lead` (nullable): `source` values add WEBSITE_QUOTE, WEBSITE_DEALER_APP, AI_ASSISTANT; add `meta Json?` for form payload (business type, monthly volume, products of interest, locations count, delivery zip).
Add `AiUsage` table now (per UPGRADE-PLAN Phase 7): userId?, feature, inputTokens, outputTokens, createdAt.

## Order of execution

1 → 2 → 3 ship together before website product pages (they block Phase 1 content). 4 → 5 ship with their phases. Each migration: `prisma migrate dev`, fresh-DB test, seed update, `tsc --noEmit` + `next build` green.
