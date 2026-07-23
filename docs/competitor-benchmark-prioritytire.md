# Competitor Benchmark — Priority Tire (size landing pages)

Reviewed 2026-07-23 · Page audited: `prioritytire.com/by-size/245-75r16-tires` (495 SKUs, Next.js custom build)

## Why they matter

Priority Tire is a top-tier US tire D2C retailer. Their size landing pages are the
main organic entry point: one page per size, ranking for "245/75R16 tires"-type
queries — the highest purchase-intent keyword class in the tire vertical.

## What they do well (verified on-page)

| Practice | Detail | Our status |
|---|---|---|
| Size-page URL structure | `/by-size/245-75r16-tires`, canonical, clean breadcrumbs | ✅ Have: `/tires/{category}/{size}` |
| Structured data | `ItemList` + `BreadcrumbList` JSON-LD | ✅ Category page; size page was ItemList-only → fixed 2026-07-23 |
| Size education block | "245 = width mm, 75 = aspect %, R = radial, 16 = rim in" prose on every size page | ✅ Added as computed spec table (better: real math, GEO-quotable) |
| Industry-specific card fields | Treadlife warranty, UTQG, Load Range/ply, tire type, speed rating on the card | ✅ ProductCard shows Load Range + ply; more fields as spec data fills in |
| Curated picks before full grid | 4 "Recommendations" above 495 results | Later — needs merchandising data |
| Sets-of-4 promos | "Save $120 on sets of 4" | N/A wholesale; our equivalent is tier pricing + pallet/container programs |
| ZIP delivery estimate on card | "Enter ZIP for estimate" | Later — pairs with Send-to-Installer routing |
| Review volume | Per-SKU ratings, up to 1000+ reviews | Later — real reviews only (brand-safety §13) |

## Their weaknesses = our openings

1. **Heavy page** — slow first render. Our SSR/ISR + CWV budget beats it.
2. **No install closure** — tires ship to the door, buyer finds an installer alone.
   Send-to-Installer + IDEAL routing is exactly this gap.
3. **No B2B channel** — no tier pricing, terms, or fleet programs. Our dual-channel core.
4. **Template SEO copy** — same boilerplate every size, numbers swapped. We answer with
   computed dimension tables (sidewall, overall diameter, revs/mile) from `tire-math.ts` —
   real data AI engines can quote (seo-requirements.md GEO rules).

## Adopted 2026-07-23 (size page upgrade)

- BreadcrumbList JSON-LD added to size pages (parity with category pages).
- Computed size-breakdown table on every size page: width / aspect / construction /
  rim / sidewall height / overall diameter / circumference / revs per mile.
- Availability summary of real spec data across listed SKUs (load ranges, speed ratings).
- Related-size internal links (same category, same rim first) — internal linking loop
  from seo-requirements.md.

## Explicitly NOT adopted

- Fake urgency, padded review counts, boilerplate per-size prose (brand-safety §13,
  no-thin-pages rule). Content must be computed or first-hand only.
