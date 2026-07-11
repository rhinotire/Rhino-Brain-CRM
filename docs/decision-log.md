# Decision Log — Website Platform

(Continues the log started in the Obsidian package, 2026-07-11.)

## 2026-07-11 — B2B + Consumer dual-channel platform adopted
Owner delivered the master build instruction (docs/b2b-consumer-lead-platform-master-instruction.md): RHINO + EVERFLOW websites become dual-channel (B2B wholesale + consumer installation leads), routing consumers to IDEAL TIRES & WHEELS first, then partner installers, with "Send This Tire to My Installer" as the dealer-recruitment engine. Dual-channel is non-negotiable; IDEAL is already operating with responsive customer service. Approved implementation decisions (see the addendum, which wins over the body): single website codebase multi-brand by domain; ConsumerLead + InstallerReferral models bridged to the existing Lead pipeline for dealer prospects; Company/Brand config table (not generic SaaS); local ZIP-centroid table for distance; MVP split A (IDEAL funnel) / B (send-to-installer); server-side AnalyticsEvent table; coupons and SMS deferred to Phase 2; MVP uses "Request Installed Price" (no retail price data exists yet). Next step per §31: architecture document before any production code.

## 2026-07-11 — Audit completed; build unblocked
RHINO BRAIN code audit + current-site crawl done (see initial-audit.md). Mandatory pre-build constraint satisfied. Pending non-blocker: rendered crawl for 301 map before launch.

## 2026-07-11 — Monorepo with shared packages (Architecture Option A)
Turborepo + pnpm: apps/rhino-brain + apps/website (+ dealer-portal), packages/database + services + ui + config. Rejected separate repos (duplicate schema violates source-of-truth) and a standalone deployed API server (overengineering for current team size; CRM already works on direct server actions — no business value in forcing it through HTTP). "Shared API layer" is realized as a shared CODE package with authorization inside; can be wrapped in REST later for third parties without rearchitecture.

## 2026-07-11 — Dealer Portal gets separate auth
DealerAccount/DealerUser models + separate session cookie. Internal User model is never extended to external users. External apps access data only via packages/services with server-side authorization.

## 2026-07-11 — Reuse tier pricing as dealer pricing
Product.priceA–D (already live in CRM) is the Dealer Portal pricing base. No new pricing system.

## 2026-07-11 — SSR/ISR mandatory for all public pages
Current site is client-rendered and invisible to crawlers and AI engines — root cause of weak traffic. Rebuild renders everything server-side; RHINO BRAIN product edits propagate via revalidateTag.

## 2026-07-11 — SEO + GEO dual strategy
Classic technical SEO plus generative-engine optimization (direct answers, HTML tables, bylines, entity consistency, llms.txt). Canonical business name must be unified ("Rhino Tire USA" vs "Rhino Tires USA") before launch — owner decision required.

## 2026-07-11 — Wheel Visualizer two-track
Third-party embed (iConfigurators/AutoSync) for automotive wheels in Phase 2; self-built bolt-pattern Trailer Wheel Finder in Phase 3 (third parties don't cover trailers; ours integrates stock + dealer pricing).

## 2026-07-11 — Sequencing
Website Phase 1 depends on Product migrations 1–3 and monorepo setup. CRM v2 Phase 5 (product catalog + inventory import UI) lands before/with website product pages, since it populates the data the website displays. v2 Phases 4/6/7 proceed in parallel per original plan.

## 2026-07-11 — Canonical name and domain strategy (owner decision)
Legal/canonical business name: **RHINO TIRE USA LLC** — brand written "Rhino Tire USA" everywhere (site, schema, GBP, socials, dealer docs). Both domains are owned: rhinotireusa.com (old live site — do not disturb) and rhinotiresusa.com (new platform launches here). Transition plan:
1. Build + launch new site on rhinotiresusa.com; old site keeps running business as usual.
2. New site declares itself canonical (self-referencing canonicals, own Search Console property, own sitemap). No cross-linking between the two sites during transition.
3. Organization schema on the new site uses legalName "RHINO TIRE USA LLC", brand "Rhino Tire USA".
4. After the new site runs stably and converts, decide the permanent primary domain (rhinotireusa.com matches the legal name exactly and is the natural long-term primary). Then 301 the ENTIRE other domain page-by-page (redirects.json map), update GBP website link, and file a change-of-address in Search Console. Never run both sites as duplicates long-term.
5. Google Business Profile keeps pointing at the old domain until cutover day — switch GBP and all citations in the same week as the 301s.
