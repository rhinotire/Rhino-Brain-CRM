/**
 * Brand-conditional site copy (docs/everflow-website-plan.md, Phase A).
 *
 * Every string that mentions a warehouse city, delivery region, or the company
 * name lives here, selected once at build time by the deployment's brand key.
 * RHINO strings are byte-identical to the pre-refactor hard-coded copy.
 *
 * Read NEXT_PUBLIC_BRAND_KEY first: three client components (tread-depth-guide,
 * dot-decoder, trailer-load-calculator) render this copy, and client bundles
 * only inline NEXT_PUBLIC_* vars — the EVERFLOW Vercel project must set BOTH
 * BRAND_KEY and NEXT_PUBLIC_BRAND_KEY or those components would hydrate as RHINO.
 */
const KEY = process.env.NEXT_PUBLIC_BRAND_KEY ?? process.env.BRAND_KEY ?? "RHINO";

const RHINO = {
  name: "Rhino Tire USA",
  legalName: "RHINO TIRE USA LLC",
  siteDescription:
    "Wholesale distributor of trailer, passenger, light-truck and commercial-truck tires, wheels and trailer parts. Warehouses in Orlando, FL and Dallas, TX. Dealer pricing for tire shops, trailer manufacturers and fleets.",
  titleDefault: "Rhino Tire USA — Wholesale Tires, Wheels & Trailer Parts",
  titleTemplate: "%s | Rhino Tire USA",

  // home
  homeTitle: "Rhino Tire USA — Wholesale Tires, Wheels & Trailer Parts Distributor",
  homeDescription:
    "B2B tire distributor with warehouses in Orlando, FL and Dallas, TX. ST trailer, passenger, light-truck and commercial-truck tires at dealer pricing. Same-week delivery in Florida.",
  heroTagline: "Wholesale tire & wheel distributor · Orlando FL · Dallas TX",
  deliveryStat: "Same-week delivery runs across Florida",
  b2bJourneyBlurb: "Tier pricing A–D, weekly Florida restock runs, mixed pallets and full containers from two warehouses.",

  // header top bar (mobile)
  headerTagline: "Wholesale · Orlando, FL",

  // embossed sidewall lettering on the hero tire graphic (≤15 chars fits the arc)
  heroSidewallText: "RHINO TIRES USA",

  // warehouse phrases for interpolation
  wh: "Orlando, FL and Dallas, TX",
  whShort: "Orlando and Dallas",
  whOur: "our Orlando and Dallas warehouses",

  // pages where grammar diverges → full strings
  partsDescription: "Trailer hubs, axles, bearing kits and accessories at wholesale pricing from Florida and Texas warehouses.",
  brandsDescription:
    "Browse the tire and wheel brands stocked in our Orlando, FL and Dallas, TX warehouses — value lines and national-brand alternatives at wholesale pricing.",
  specialtyDescription:
    "Wholesale specialty tires: ATV/UTV, golf cart, lawn & garden, industrial and agricultural. Dealer pricing from Orlando, FL and Dallas, TX warehouses.",
  sizeBlurbFrom: "from our Florida and Texas warehouses",

  // dealer surfaces
  findInstallDescription:
    "Enter your tire size and ZIP code to find local professional installation. Orlando-area customers install at IDEAL TIRES & WHEELS.",
  dealerMetaDescription:
    "Apply for a Rhino Tire USA dealer account: tier pricing on tires, wheels and trailer parts, Florida and Texas warehouses, weekly delivery runs.",
  dealerWarehouseBenefit: "Orlando & Dallas warehouses — same-week Florida delivery runs",
  dealerQualifyLine: "tier pricing, weekly Florida delivery runs and container programs",
};

const EVERFLOW: typeof RHINO = {
  name: "Everflow Tires & Wheels",
  legalName: "EVERFLOW TIRES & WHEELS LLC",
  siteDescription:
    "Wholesale distributor of trailer, passenger, light-truck and commercial-truck tires, wheels and trailer parts in Dallas, TX. Dealer pricing for tire shops, trailer manufacturers and fleets across Dallas–Fort Worth.",
  titleDefault: "Everflow Tires & Wheels — Wholesale Tires, Wheels & Trailer Parts",
  titleTemplate: "%s | Everflow Tires & Wheels",

  homeTitle: "Everflow Tires & Wheels — Wholesale Tire & Wheel Distributor in Dallas, TX",
  homeDescription:
    "B2B tire and wheel distributor in Dallas, TX. ST trailer, passenger, light-truck and commercial-truck tires at dealer pricing for shops, fleets and trailer manufacturers across Dallas–Fort Worth.",
  heroTagline: "Wholesale tire & wheel distributor · Dallas TX",
  deliveryStat: "Local pickup & delivery across Dallas–Fort Worth",
  b2bJourneyBlurb: "Tier pricing A–D, mixed pallets and full containers, with local pickup and delivery from our Dallas warehouse.",

  headerTagline: "Wholesale · Dallas, TX",

  heroSidewallText: "EVERFLOW TIRES",

  wh: "Dallas, TX",
  whShort: "Dallas",
  whOur: "our Dallas warehouse",

  partsDescription: "Trailer hubs, axles, bearing kits and accessories at wholesale pricing from our Dallas, TX warehouse.",
  brandsDescription:
    "Browse the tire and wheel brands stocked in our Dallas, TX warehouse — value lines and national-brand alternatives at wholesale pricing.",
  specialtyDescription:
    "Wholesale specialty tires: ATV/UTV, golf cart, lawn & garden, industrial and agricultural. Dealer pricing from our Dallas, TX warehouse.",
  sizeBlurbFrom: "from our Dallas, TX warehouse",

  findInstallDescription:
    "Enter your tire size and ZIP code to find local professional installation through our Dallas–Fort Worth dealer network.",
  dealerMetaDescription:
    "Apply for an Everflow Tires & Wheels dealer account: tier pricing on tires, wheels and trailer parts, Dallas warehouse pickup and delivery, and installation-customer referrals.",
  dealerWarehouseBenefit: "Dallas, TX warehouse — local pickup and DFW delivery",
  dealerQualifyLine: "tier pricing, local Dallas–Fort Worth delivery and container programs",
};

export const COPY = KEY === "EVERFLOW" ? EVERFLOW : RHINO;
