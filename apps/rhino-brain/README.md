# Rhino Brain CRM (v2 in progress)

> v2 Phase 1 (database foundation: Locations, Products, Inventory, Orders, CustomerDocuments) is complete. See UPGRADE-PLAN.md for remaining phases 2-7.

# TirePro CRM

A web-based inside sales management system for a tire / wheel / trailer parts wholesale business (B2B).

Built with **Next.js 14 (App Router) + TypeScript + Tailwind CSS + Prisma + PostgreSQL**.

## Features

- **Role-based access** — Admin (owner), Sales Manager, Sales Rep. Reps automatically see only their own customers, leads, quotes, tasks and activities.
- **Owner Dashboard** — team KPIs, rep activity ranking, quotes pending follow-up, Customer Attention List, overdue tasks.
- **My Work Today** — rep work center: calls today, meaningful conversations, overdue & due-today follow-ups, new leads, quotes needing follow-up, task list, 30-day reactivation list, one-click activity logging.
- **Customer CRM** — full profiles, tiers (A–D), product interests, maintenance temperature (Hot <7d / Warm <30d / Cooling 30–60d / Inactive 60–90d / Lost >90d), contact history timeline, quote history, opportunities, Tireguru placeholder.
- **Lead Pipeline** — kanban board (New Lead → Contacted → Interested → Quoted → Negotiating → First Order → Active Customer, plus Lost with reasons), one-click stage moves, lead assignment, convert-to-customer (migrates history), "Needs First Contact" alert for new leads untouched 3+ days.
- **Activity Tracking** — 12 activity types incl. No Answer / Voicemail, "meaningful conversation" flag, untouched-customers view (7/14/30/60/90 days).
- **Quote Management** — line items with size/SKU/brand, competitor price tracking, statuses (Draft / Sent / Follow-up Needed / Accepted / Rejected / Expired), automatic **Follow-up Needed** when a sent quote has no follow-up in 3 days, win-rate reporting.
- **Tasks** — priorities, types, overdue highlighting, manager-to-rep assignment with notifications.
- **Product Opportunities** — track what each customer *could* buy: category, monthly volume, current supplier, target price, probability.
- **Reports** — rep performance (calls, meaningful conversations, quotes sent/won, win rate, won value, conversions) with Today / Week / Month / custom ranges; customer health report with temperature breakdown and Attention List.
- **CSV import/export** — import customers & leads (papaparse, header auto-mapping), export customers / leads / activities / quotes.
- **Notifications** — in-app bell for assigned leads, overdue tasks, quote follow-ups.

## Requirements

- Node.js 18.17+ (20 LTS recommended)
- PostgreSQL 14+ (local, Docker, or hosted e.g. Supabase / Neon / RDS)

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env:
#   DATABASE_URL="postgresql://user:password@localhost:5432/tirepro"
#   SESSION_SECRET="<any long random string — run: openssl rand -base64 32>"

# 3. Create the database schema
npm run db:push          # quick start (no migration files)
# or, for production migration history:
npm run db:migrate

# 4. Seed demo data (3 reps, 30 customers, 20 leads, 50 activities, 20 tasks, 15 quotes, 10 opportunities)
npm run db:seed

# 5. Run
npm run dev              # http://localhost:3000
```

### Demo logins (password for all: `demo1234`)

| Role | Email |
|---|---|
| Owner (Admin) | owner@rhinobrain.com |
| Sales Manager | linda@rhinotireusa.com |
| Sales Rep | mike@rhinotireusa.com / sarah@rhinotireusa.com / carlos@rhinotireusa.com |

> Change these immediately for real use — Settings → Users (as owner).

### Using Supabase as the database

Create a Supabase project → Settings → Database → copy the **connection string (URI)** into `DATABASE_URL` (use the *session pooler* string for serverless deploys, port 5432 direct for migrations). Everything else is identical.

## Production build

```bash
npm run build
npm start
```

Deploys cleanly to Vercel, Railway, Render, or any Node host. Set `DATABASE_URL` and `SESSION_SECRET` as environment variables.

## Project structure

```
prisma/schema.prisma        Database schema (all enums + 12 models)
prisma/seed.ts              Demo data
src/lib/auth.ts             JWT session (jose) + role helpers + rep scoping
src/lib/domain.ts           Business rules: temperature, 3-day quote rule, scoring, labels
src/actions/*.ts            Server actions (customers, leads, activities, tasks, quotes, users)
src/app/(app)/*             Authenticated pages (dashboard, customers, pipeline, quotes, …)
src/app/api/export/*        CSV export endpoints
src/components/*            Forms, modals, kanban cards, CSV importer, UI primitives
```

## Business rules implemented

- Quote sent + no follow-up logged within **3 days** → shown as **Follow-up Needed** (dashboard + quotes list + rep work center). Logging any contact activity against the quote resets the clock.
- Lead in **New Lead** stage with no activity for **3+ days** → **Needs First Contact** badge on the pipeline.
- Logging a contact activity on a customer updates *Last Contact* and recalculates the customer score; on a New Lead it auto-advances the stage to Contacted.
- Customer temperature is computed from *Last Contact* (never stored stale).

## Tireguru POS integration

Placeholder is in **Settings → Import / Export**. `Customer.tireguruId` and `Customer.externalSource` fields are already in the schema, so wiring the Tireguru API later requires no schema change. Until then, export customers from Tireguru as CSV and import them.

## Roadmap ideas

- AI assistant panel (dashboard placeholder exists): daily call-list suggestions, quote-risk scoring.
- Email/SMS sending & templates.
- Commission tracking, goals vs. actuals.
