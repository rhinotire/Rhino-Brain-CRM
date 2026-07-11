# Sitemap — RHINO TIRES USA Public Website

Mobile-first. Every template tested at 360 / 390 / 768 / 1024 / 1440 px before merge.

## URL structure

```
/                                    Homepage
/tires                               Category hub
/tires/st-trailer                    Subcategory (also: /passenger /light-truck /commercial-truck)
/tires/st-trailer/st235-80r16        Size page (lists all SKUs in this size — key SEO surface)
/products/{slug}                     SKU detail page
/wheels /wheels/steel /wheels/aluminum /wheels/off-road
/wheels/trailer-wheel-finder         Self-built bolt-pattern matcher (Phase 3)
/assemblies                          Tire & wheel assemblies
/parts                               Valves, accessories, trailer parts
/brands /brands/{brand}
/inventory-search                    Live stock status search
/quote                               Wholesale quote request (also sticky CTA sitewide)
/become-a-dealer                     Dealer application (multi-step, saves partial as Lead)
/dealer                              Dealer Portal login + authenticated area
/solutions/tire-dealers /solutions/trailer-manufacturers /solutions/fleets
/knowledge                           Knowledge Center hub
/knowledge/{article-slug}            e.g. load-range-e-vs-g-vs-h, st-tire-selection-guide
/service-areas/orlando /tampa /jacksonville /miami /florida /nationwide
/about /contact /warranty /shipping /reviews
```

Rules: lowercase, hyphenated, no query-param canonical pages, breadcrumbs on every level, XML sitemap auto-generated, robots.txt allows all public routes and blocks /dealer/*.

## Page templates (7 total)

1. **Homepage** — B2B positioning line, size/SKU search box above the fold, three primary CTAs (Search Inventory / Get Wholesale Quote / Become a Dealer), category tiles, brands, solutions strips, delivery coverage map, reviews, Knowledge teaser, AI assistant entry, standardized NAP in footer.
2. **Category/size listing** — filter rail (size, brand, load range, ply, application; bolt pattern for wheels), mobile filter drawer, stock badge, dealer-login price hint ("Log in for your price").
3. **Product detail** — gallery, spec table (readable on 360px — two-column collapse), load/inflation table, compatible wheels/valves (ProductRelation), stock status per warehouse bucket, Get Quote CTA, Product+Offer+FAQ schema, related sizes.
4. **Conversion forms** — quote request and dealer application; ≤2 screens on mobile; every submit creates a Lead (source WEBSITE_QUOTE / WEBSITE_DEALER_APP) and auto-assigns a rep; server-validated, rate-limited, honeypot + turnstile.
5. **Knowledge article** — direct answer first paragraph, comparison tables, author + reviewed-by + updated date, Article schema, inline product links, quote CTA.
6. **Service area** — real coverage info only (warehouse, delivery days, brands stocked, local reviews); no thin duplicates; LocalBusiness schema.
7. **Dealer Portal** (authenticated) — dashboard, price list (own tier), inventory, quote builder, order history, claims, account.

## Navigation

Top bar: Tires · Wheels · Assemblies · Parts · Brands · Solutions · Knowledge | phone (click-to-call) · Get Quote (accent) · Dealer Login.
Mobile: sticky bottom bar — Call · Search · Get Quote.

## 301 map

PENDING rendered crawl of current site. Placeholder file `redirects.json` in the website app; populate before launch. Old URLs → nearest equivalent, never mass-redirect to homepage.
