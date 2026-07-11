# RHINO TIRES USA Platform

Turborepo + pnpm monorepo. See `docs/architecture.md` for the binding architecture.

```
apps/
  rhino-brain     internal CRM (Rhino Brain — AI Business Command Center)
  website         (STEP 4) public site, SSR/ISR
packages/
  database        Prisma schema + client singleton (single source of truth)
  services        shared business rules + authorization (populated in STEP 3)
  ui              shared UI primitives (extracted incrementally)
  config          shared tsconfig/eslint/tailwind presets
```

## Commands

```bash
pnpm install                                  # installs everything, generates Prisma client
pnpm --filter rhino-brain dev                 # run the CRM locally
pnpm build                                    # turbo build (all apps)
pnpm --filter @rhino/database db:push         # push schema changes
pnpm --filter @rhino/database db:seed         # seed demo data
```

## Deployment

Vercel, one project per app. The `rhino-brain` project's Root Directory is `apps/rhino-brain`.
Env vars (per app, server-only): `DATABASE_URL`, `SESSION_SECRET`, `ANTHROPIC_API_KEY`,
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. See `apps/rhino-brain/README.md` for CRM details.
