# SEO + GEO Requirements — RHINO TIRES USA

Goal: maximum qualified traffic from BOTH classic search and AI engines (ChatGPT, Perplexity, Google AI Overviews). The current site renders client-side and is invisible to both — the rebuild must never regress on server-rendered content.

## Technical SEO (non-negotiable, every public page)

- SSR/ISR only. View-source must show full content. No content behind JS execution.
- Unique title (≤60 chars) + meta description (≤155); canonical URL; clean breadcrumbs.
- Semantic HTML (one h1, logical h2/h3), descriptive alt text, internal links between size pages ↔ products ↔ knowledge articles.
- XML sitemap (auto, split by type), robots.txt, Open Graph + Twitter cards.
- Core Web Vitals: LCP <2.5s mobile 4G, CLS <0.1, INP <200ms. Budget enforced in CI (Lighthouse).
- No thin/duplicate pages, no keyword stuffing, no fake reviews, no fake inventory (also brand-safety rules from CLAUDE.md §13).

## Structured data (JSON-LD)

| Page | Schema |
|---|---|
| Product detail | Product + Offer (availability from real stock status) + FAQPage where present |
| Category/size | ItemList + BreadcrumbList |
| Knowledge | Article (author, dateModified, reviewedBy) |
| Service area | LocalBusiness (real NAP only) |
| Sitewide | Organization + WebSite + SearchAction |

## GEO — Generative Engine Optimization

AI engines cite pages that answer directly and carry verifiable facts. Requirements:

1. Every knowledge article opens with a 2–3 sentence direct answer to the title question.
2. Technical tables (load/inflation, ply vs load range, size equivalents) in real HTML tables — the most quotable asset we have.
3. First-hand signals: "Based on our Orlando warehouse shipping data…" — real distributor experience AI cannot get elsewhere.
4. Author/reviewer bylines + visible updated dates on all content.
5. Consistent entity identity: ONE canonical business name, same NAP everywhere (site, GBP, socials, schema). Resolve "Rhino Tire USA" vs "Rhino Tires USA" before launch.
6. llms.txt at root describing the business and key data pages.
7. Monitor: track referrals from AI engines in GA4 (source patterns) quarterly.

## Content plan (initial 12 articles — real expertise only)

Load Range E vs G vs H for trailer tires · ST tire selection by trailer type · Fast-moving ST sizes in Florida (our sales data) · 14-ply vs 10-ply ST235/80R16 · Trailer tire & wheel assembly buying guide for manufacturers · Bolt pattern measurement guide · Commercial truck tire position guide · Tire date codes & DOT explained · Valve stem compatibility · Dealer inventory planning for tire shops · Wholesale tire buying: container vs LTL · Trailer tire pressure & load tables.

## Local SEO

Real service-area pages only (Orlando HQ + true delivery zones). Google Business Profile: standardize, add products/photos/posts cadence. NAP audit checklist kept in this repo.

## Measurement

GA4 (events: quote_request, dealer_application, ai_assistant_used, click_to_call) · Google Search Console (submit sitemaps day one) · Microsoft Clarity (mobile UX sessions) · rank + AI-citation spot checks monthly.

## Domain and entity policy (decided 2026-07-11)
- Canonical entity: legalName **RHINO TIRE USA LLC**, brand **Rhino Tire USA** — one spelling everywhere regardless of domain.
- New platform launches on **rhinotiresusa.com**; old site stays live on rhinotireusa.com untouched during transition. No cross-links, no shared content copies.
- New site: self-referencing canonicals, own GSC property + sitemap submission at launch.
- Cutover (post-stabilization, separate approval): page-level 301s from the retired domain, GBP + citations updated same week, GSC change-of-address. Track both domains in GA4 until cutover completes.
