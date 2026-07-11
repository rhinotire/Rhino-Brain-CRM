# Architecture — RHINO TIRES USA Platform

Decision date: 2026-07-11 (see decision-log.md)

## Principle

Three applications, one shared services package, one database. Data exists exactly once; trust level determines which service functions an app may call.

```
apps/website (public)        apps/dealer-portal (external auth)     apps/rhino-brain (internal)
        \                            |                                  /
         \___________________ packages/services ______________________/
                    (authorization + business rules, server-side)
                                     |
                            packages/database
                       (single Prisma schema, PostgreSQL)
```

## Monorepo layout (Turborepo + pnpm workspaces)

```
/apps
  /rhino-brain        existing tirepro-crm, moved as-is, then progressively imports packages/*
  /website            new — public site, SSR/ISR
  /dealer-portal      Phase 2 — may start as a route group inside website, split later if needed
/packages
  /database           prisma schema + client + migrations (single source of truth)
  /services           product, inventory, pricing, quote, lead, order, dealer-auth services
  /ui                 shared primitives (extend from existing src/components/ui)
  /config             eslint, tsconfig, tailwind presets
```

Migration path: move `tirepro-crm` into `apps/rhino-brain` unchanged (build must still pass), extract `prisma/` into `packages/database`, then extract business logic from `src/actions/*` into `packages/services` incrementally — never break the CRM.

## Trust tiers

| App | Auth | Data access rule |
|---|---|---|
| website | anonymous | whitelist read services only: published products, stock STATUS buckets, content; writes limited to createQuoteRequest / createLead (rate-limited, validated) |
| dealer-portal | DealerUser sessions (separate from internal User) | own Customer scope only: own tier prices, own quotes/orders/invoices; server-side authorization on every call |
| rhino-brain | internal User (existing JWT) | full access via existing patterns (repScope + locationScope) |

Hard rules: the public app never imports `packages/database` directly — only `packages/services`. Dealer pricing (priceA–D), cost, and margins never serialize into public responses; enforce with dedicated public DTOs.

## Rendering and caching (traffic-critical)

- Product/category/knowledge pages: SSR + ISR. When RHINO BRAIN edits a product, the service layer calls `revalidateTag(product:{sku})` → website updates within seconds. This delivers "BRAIN 改资料,网站自动更新" without any sync jobs.
- Search: Typesense (self-hosted, cheap) or Algolia. Index rebuilt from Product service on change; supports size-tolerant queries ("235 80 16" → ST235/80R16).
- Targets: LCP < 2.5s on 4G mobile, CLS < 0.1, INP < 200ms. Images via next/image, AVIF/WebP.

## Deployment

- Vercel (or equivalent Node host): three apps deployed separately from one repo; dev / staging / production environments.
- PostgreSQL: single managed instance (Supabase/Neon/RDS) shared by all environments' respective databases. Supabase Storage already planned for customer documents (v2 Phase 4).
- Env strategy: per-app `.env`; `SESSION_SECRET` and `ANTHROPIC_API_KEY` server-only; fail hard if missing in production.

## Source of truth (unchanged from handbook)

Product/SKU, Inventory, Pricing, Customer, Lead, Quote, Order → `packages/database` models already in RHINO BRAIN. Public articles → content collection in the website app (MDX or DB-backed), versioned. AI knowledge → approved sources only (ai-agent-rules.md).

## Future third-party API

If Tire Guru sync or dealer-system integrations need HTTP APIs later, wrap `packages/services` in REST route handlers with API keys. The service layer is the stable contract; no rearchitecture required.
