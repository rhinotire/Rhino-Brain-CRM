import { assignStateLocation } from "./prospect-score";
import { countryFromState } from "./dealer-list-parse";
import type { DealerRecord } from "./dealer-list-parse";

/**
 * Release-order tiers for the dealer-locator list (spec §5, highest first).
 * Pure functions: no DB, no network, no I/O.
 *
 *  1 already a customer              -> cross-sell, not a prospect
 *  2 home state, 2+ brands
 *  3 home state, 1 brand, within ~150 miles of a hub (Orlando / Dallas)
 *  4 home state, 1 brand, everything else
 *  5 non-home state, 3+ brands
 *  6 high-density metro, non-home    -> needs city-density data; assigned by
 *                                       the caller, never produced here
 *  7 non-home single/dual brand      -> email nurture only
 *  8 Canada / international          -> parked
 *  9 blacklist / opted out           -> excluded upstream; never produced here
 */
export type Tier = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

const HUB_RADIUS_MILES = 150;
const HOME_MULTI_BRAND_MIN = 2;
const NON_HOME_MULTI_BRAND_MIN = 3;

export function tierFor(
  d: DealerRecord,
  opts: { milesFromHub?: number | null; isExistingCustomer?: boolean } = {},
): Tier {
  if (opts.isExistingCustomer) return 1;

  // Territory is derived from the State code here, not read from the stored
  // d.country, so a stale or rebuilt record cannot park a home-state dealer.
  // Canada and international are parked for this phase.
  const state = d.state.trim();
  if (countryFromState(state) !== "US") return 8;

  const brandCount = d.brands.length;

  if (assignStateLocation(state) !== null) {
    if (brandCount >= HOME_MULTI_BRAND_MIN) return 2;
    const miles = opts.milesFromHub;
    return miles != null && miles <= HUB_RADIUS_MILES ? 3 : 4;
  }

  return brandCount >= NON_HOME_MULTI_BRAND_MIN ? 5 : 7;
}

/**
 * Release order: tier ascending, then more brands first, then dealers with an
 * email (workable without an Apollo credit), then name for determinism.
 * Tiers are computed without distance/customer context, so a caller that has
 * those should sort on its own tierFor(d, opts) result first.
 */
export function compareForRelease(a: DealerRecord, b: DealerRecord): number {
  const byTier = tierFor(a) - tierFor(b);
  if (byTier !== 0) return byTier;

  const byBrands = b.brands.length - a.brands.length;
  if (byBrands !== 0) return byBrands;

  const byEmail = Number(hasEmail(b)) - Number(hasEmail(a));
  if (byEmail !== 0) return byEmail;

  const an = a.name.toLowerCase();
  const bn = b.name.toLowerCase();
  return an < bn ? -1 : an > bn ? 1 : 0;
}

function hasEmail(d: DealerRecord): boolean {
  return d.email.trim() !== "";
}
