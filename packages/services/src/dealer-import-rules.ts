import zipcodes from "zipcodes";
import type { DealerRecord } from "./dealer-list-parse";
import type { GeoDealerRecord } from "./dealer-cluster";
import { clusterByCity, milesFromHub } from "./dealer-cluster";
import { tierFor, type Tier } from "./dealer-tier";
import { assignStateLocation } from "./prospect-score";
import { countryFromState } from "./geo-state";
import { domainKey, nameKey, phoneKey } from "./referral-matching";

/**
 * The testable rules behind scripts/import-dealers.ts. Pure functions: no DB,
 * no network, no file I/O, no clock of its own (crossSellTaskFor takes an injectable
 * `now`). The CLI owns every side effect; anything that decides WHAT gets
 * written lives here so it can be unit-tested.
 */

// ---- constants --------------------------------------------------------------

/** The golf-cart sheet. A dealer whose ONLY brand is this is not a wheel shop. */
export const GOLF_CART_BRAND = "GOLF CART (STEELENG)";

/** Marker written to Lead.meta so a re-run can tell its own rows from other sources. */
export const IMPORT_SOURCE = "dealer-locators";

/**
 * Tier 6 = a non-home US dealer in a city holding at least this many dealers
 * on the list. Owner-reviewable: tierFor has no density input, so the importer
 * owns this number (spec section 5, rank 6).
 */
export const HIGH_DENSITY_MIN = 5;

/** Fewer digits than this is not a dialable number. */
const MIN_PHONE_DIGITS = 10;

// ---- the ImportBatch row -----------------------------------------------------------------

/** What one real run did, as the importer counted it. */
export type ImportOutcome = { created: number; createFailed: number; updated: number; updateFailed: number };

/**
 * The numbers the importer writes on its ImportBatch row. `successful` means CREATES
 * only, and that is what makes reconcile-dealers.ts's check a real one: a lead is stamped
 * with the batch id only when it is created (mergeIntoExisting never sets importBatchId, so
 * an updated lead keeps the batch it was first imported under), hence the batch's lead
 * count equals `successful` exactly, on a first import and on any re-run. Counting updates
 * in `successful` made a healthy mixed re-run (10 creates + 5 updates) read as 15 against
 * 10 leads and print MISMATCH with nothing wrong.
 *
 * The row has no column for updates (adding one is a schema migration), so the importer
 * prints the update count when it runs but cannot persist it. `failed` still covers
 * both kinds of failure.
 */
export function importBatchFigures(o: ImportOutcome): { successful: number; failed: number } {
  return { successful: o.created, failed: o.createFailed + o.updateFailed };
}

/**
 * Only a run that creates leads gets an ImportBatch. An update-only re-run would otherwise
 * leave a batch row holding zero leads, and `reconcile --batch <id>` reports NO DATA (exit 1)
 * for a batch that did real work.
 */
export function needsImportBatch(leadsToCreate: number): boolean {
  return leadsToCreate > 0;
}

// ---- shouldImport -------------------------------------------------------------

export type ImportFlags = {
  /** findBlacklistMatch() hit: never imported, in any form. */
  blacklisted?: boolean;
  /** isExcluded() hit (any ExclusionList kind): not imported as a lead. */
  excluded?: boolean;
  /** The dealer is already a Lead that this importer must not touch. */
  alreadyLead?: boolean;
};

export type SkipReason = "BLACKLISTED" | "EXCLUDED" | "ALREADY_LEAD" | "NON_DEDUPABLE";

export type ImportDecision = { ok: true } | { ok: false; reason: SkipReason };

/**
 * Gate order is part of the contract: blacklist first (so a blacklisted dealer
 * is reported as such even if it is also excluded or non-dedupable), then
 * exclusion, then "already a lead", then "no stable identity".
 *
 * dedupeKey === "" is NEVER written: Lead.dedupeKey is @unique, so the second
 * such row would fail the whole import.
 */
export function shouldImport(d: DealerRecord, flags: ImportFlags = {}): ImportDecision {
  if (flags.blacklisted) return { ok: false, reason: "BLACKLISTED" };
  if (flags.excluded) return { ok: false, reason: "EXCLUDED" };
  if (flags.alreadyLead) return { ok: false, reason: "ALREADY_LEAD" };
  if (!d.dedupeKey) return { ok: false, reason: "NON_DEDUPABLE" };
  return { ok: true };
}

// ---- state repair -------------------------------------------------------------

export type ResolvedGeo = {
  /** The state to route and tier on (repaired when the stored one is garbled). */
  state: string;
  country: "US" | "CA" | "OTHER";
  /** True when `state` came from a zip lookup rather than the record. */
  repairedFromZip: boolean;
};

const ZIP5_RE = /^(\d{5})(?:-\d{4})?$/;

/**
 * Resolves the state a record should be routed on.
 *
 * ~68 records carry a "state" that is neither a US code nor a Canadian
 * province ("LAA", "Ml", "CA.", "CANADA", or blank because the row was
 * column-shifted). Where the record has a usable ZIP (5 digits, or ZIP+4) and
 * the ZIP resolves to a US state, that state wins. "LAA" + 70737 is Gonzales,
 * Louisiana, an Everflow home state that would otherwise never be worked.
 *
 * The repair fires ONLY when the stored state is unrecognised. A valid state
 * (even a mismatched one) is never overridden by its ZIP: a typo in the ZIP
 * must not move a correctly-stated dealer into another company's territory.
 */
export function resolveGeo(d: Pick<DealerRecord, "state" | "zip">): ResolvedGeo {
  const raw = d.state.trim();
  const upper = raw.toUpperCase();
  const known = countryFromState(upper);
  if (known !== "OTHER") return { state: upper, country: known, repairedFromZip: false };

  // Explicit "CANADA" / "BC CANADA" is Canada, not a repairable US typo.
  if (/\bCANADA\b/.test(upper)) return { state: upper, country: "CA", repairedFromZip: false };

  const m = ZIP5_RE.exec(d.zip.trim());
  if (m) {
    const hit = zipcodes.lookup(m[1]);
    if (hit && countryFromState(hit.state) === "US") {
      return { state: hit.state.toUpperCase(), country: "US", repairedFromZip: true };
    }
  }
  return { state: upper, country: "OTHER", repairedFromZip: false };
}

// ---- territory routing -----------------------------------------------------------

export type LocationIds = { rhino: string | null; everflow: string | null; qingdao: string | null };

/**
 * Territory routing:
 *   home states (Rhino / Everflow)  -> that company's location id
 *   non-home US state               -> null  (nurture pool: must NEVER reach a rep queue)
 *   Canada                          -> null  (parked: still imported for the record, but a
 *                                             Qingdao rep must not receive it in My Work)
 *   unresolvable state              -> null  (we cannot claim it is international)
 *
 * ids.qingdao is accepted for signature stability but deliberately unused.
 *
 * Delegates the home-state decision to assignStateLocation so there is one
 * definition of "home".
 */
export function locationForRecord(d: Pick<DealerRecord, "state" | "zip">, ids: LocationIds): string | null {
  const geo = resolveGeo(d);
  const home = assignStateLocation(geo.state);
  if (home === "RHINO") return ids.rhino;
  if (home === "EVERFLOW") return ids.everflow;
  return null;
}

/** Which home company a record belongs to, or null (non-home / Canada / unresolved). */
export function homeCompanyOf(d: Pick<DealerRecord, "state" | "zip">): "RHINO" | "EVERFLOW" | null {
  return assignStateLocation(resolveGeo(d).state);
}

export type TerritoryKey = "RHINO" | "EVERFLOW" | "OTHER_US" | "CANADA" | "UNRESOLVED";

/**
 * The territory a record belongs to, on the REPAIRED state (resolveGeo). import-dealers.ts
 * (what gets built) and reconcile-dealers.ts (the report the owner approves before it is built)
 * both classify through this one function, so they cannot disagree: reading the raw state in the
 * report filed the ZIP-repaired records (LAA + 70737 = Louisiana, a real Everflow dealer) under
 * "Unresolved" while the importer routed them to Everflow.
 */
export function territoryKeyOf(d: Pick<DealerRecord, "state" | "zip">): TerritoryKey {
  const home = homeCompanyOf(d);
  if (home) return home;
  const g = resolveGeo(d);
  return g.country === "US" ? "OTHER_US" : g.country === "CA" ? "CANADA" : "UNRESOLVED";
}

// ---- phone ----------------------------------------------------------------------

/**
 * Returns the phone as the list holds it when it is dialable, otherwise null.
 * 9 records hold non-numeric junk ("NOT OPEN TO PUBLIC"); a rep's dialer must
 * never be handed that.
 */
export function cleanPhone(phone: string | null | undefined): string | null {
  const p = (phone ?? "").trim();
  if (!p) return null;
  const digits = p.replace(/\D/g, "");
  return digits.length >= MIN_PHONE_DIGITS ? p : null;
}

// ---- type -------------------------------------------------------------------------

/** WHEEL_SHOP, except a dealer whose only brand is the golf-cart sheet. */
export function leadTypeFor(d: Pick<DealerRecord, "brands">): "WHEEL_SHOP" | "ATV_GOLF" {
  return d.brands.length > 0 && d.brands.every((b) => b === GOLF_CART_BRAND) ? "ATV_GOLF" : "WHEEL_SHOP";
}

// ---- coordinates & distance --------------------------------------------------------

export type CoordCandidate = { city: string; state: string; zip: string; lat: number; lng: number };

const cityNorm = (s: string): string => s.toUpperCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
const zip5Of = (s: string): string => s.replace(/\D/g, "").slice(0, 5);

/**
 * Picks the coordinate row that belongs to the dealer's TOP-LEVEL city/state.
 *
 * A dealer with several branches shares one dedupeKey across all their scrape
 * rows, so a plain key join returns whichever branch came first, which may be
 * a different city. Distance to the warehouse must be measured from the
 * location the record is filed under, so a candidate qualifies only when its
 * city and state equal the record's own. Returns null when none does (the
 * caller then falls back to the top-level ZIP centroid, never to another
 * branch).
 */
export function pickCoordinate(
  d: Pick<DealerRecord, "city" | "state" | "zip">,
  candidates: CoordCandidate[],
): { lat: number; lng: number } | null {
  const city = cityNorm(d.city);
  const state = d.state.trim().toUpperCase();
  if (!city || !state) return null;
  const sameCity = candidates.filter((c) => cityNorm(c.city) === city && c.state.trim().toUpperCase() === state);
  if (sameCity.length === 0) return null;
  const z = zip5Of(d.zip);
  const best = (z && sameCity.find((c) => zip5Of(c.zip) === z)) || sameCity[0];
  return { lat: best.lat, lng: best.lng };
}

/**
 * Miles from the dealer's TOP-LEVEL location to the warehouse that serves its
 * home state. null for non-home dealers (distance is never used for them) and
 * when no usable coordinate exists.
 *
 * Coordinate source, in order: lat/lng on the record (must have been matched
 * to the top-level city, see pickCoordinate), then, when allowed, the
 * centroid of the top-level ZIP, accepted only if that ZIP is in the same
 * state the record is routed on.
 */
export function milesToHomeHub(
  d: GeoDealerRecord,
  state: string,
  opts: { zipCentroid?: boolean } = {},
): number | null {
  const home = assignStateLocation(state);
  if (!home) return null;

  let lat: number | undefined;
  let lng: number | undefined;
  if (typeof d.lat === "number" && typeof d.lng === "number") {
    lat = d.lat;
    lng = d.lng;
  } else if (opts.zipCentroid) {
    const m = ZIP5_RE.exec(d.zip.trim());
    const hit = m ? zipcodes.lookup(m[1]) : undefined;
    if (hit && hit.state.toUpperCase() === state) {
      lat = hit.latitude;
      lng = hit.longitude;
    }
  }
  if (lat === undefined || lng === undefined) return null;
  return milesFromHub(lat, lng, home);
}

// ---- tier -----------------------------------------------------------------------------

export type DensityIndex = Map<string, number>;

const densityKey = (city: string, state: string): string => `${cityNorm(city)}|${state.trim().toUpperCase()}`;

/** Dealers per distinct city, from the real clustering (so one dealer = one pin). */
export function buildDensityIndex(records: DealerRecord[]): DensityIndex {
  const idx: DensityIndex = new Map();
  for (const c of clusterByCity(records)) idx.set(densityKey(c.city, c.state), c.count);
  return idx;
}

export function densityOf(d: Pick<DealerRecord, "city" | "state">, idx: DensityIndex): number {
  return idx.get(densityKey(d.city, d.state)) ?? 1;
}

/**
 * The tier stored on the lead. Uses the FULL tierFor options (distance and
 * customer status): compareForRelease takes no options and would flatten every
 * home single-brand dealer to tier 4.
 *
 * Tier 6 is assigned here, after clustering, because tierFor has no density
 * input: a non-home US dealer that tierFor ranks 7 (fewer than 3 brands) and
 * that sits in a city of HIGH_DENSITY_MIN or more dealers is promoted to 6.
 * Tier 5 (3+ brands) already outranks it; tier 9 never occurs (blacklisted
 * dealers are not imported).
 */
export function tierForRecord(
  d: DealerRecord,
  geo: ResolvedGeo,
  ctx: { milesFromHub?: number | null; isExistingCustomer?: boolean; density?: number } = {},
): Tier {
  // Rank on the repaired state, not the stored one.
  const t = tierFor({ ...d, state: geo.state, country: geo.country }, {
    milesFromHub: ctx.milesFromHub ?? null,
    isExistingCustomer: ctx.isExistingCustomer ?? false,
  });
  if (t === 7 && geo.country === "US" && (ctx.density ?? 1) >= HIGH_DENSITY_MIN) return 6;
  return t;
}

// ---- existing-lead matching --------------------------------------------------------------

export type ExistingLeadRow = {
  id: string;
  companyName: string;
  phone: string | null;
  city: string | null;
  dedupeKey: string | null;
  meta: unknown;
};

export type LeadIndex = {
  byKey: Map<string, ExistingLeadRow>;
  domains: Set<string>;
  phones: Set<string>;
  nameCity: Set<string>;
};

const metaObject = (meta: unknown): Record<string, unknown> =>
  meta && typeof meta === "object" && !Array.isArray(meta) ? (meta as Record<string, unknown>) : {};

/** True when the lead was written by this importer (so a re-run may touch it). */
export function isDealerImportLead(l: Pick<ExistingLeadRow, "meta">): boolean {
  return metaObject(l.meta).importSource === IMPORT_SOURCE;
}

export function buildLeadIndex(leads: ExistingLeadRow[]): LeadIndex {
  const idx: LeadIndex = { byKey: new Map(), domains: new Set(), phones: new Set(), nameCity: new Set() };
  for (const l of leads) {
    if (l.dedupeKey) {
      idx.byKey.set(l.dedupeKey, l);
      if (l.dedupeKey.startsWith("d:")) idx.domains.add(l.dedupeKey.slice(2));
    }
    const w = metaObject(l.meta).website;
    const dk = domainKey(typeof w === "string" ? w : null);
    if (dk) idx.domains.add(dk);
    const pk = phoneKey(l.phone);
    if (pk) idx.phones.add(pk);
    const nk = nameKey(l.companyName);
    const city = (l.city ?? "").trim().toLowerCase();
    if (nk.length >= 4 && city) idx.nameCity.add(`${nk}:${city}`);
  }
  return idx;
}

export type LeadMatch =
  | { kind: "UPDATE"; lead: ExistingLeadRow } // same dedupeKey, written by this importer
  | { kind: "SKIP"; via: "dedupeKey" | "domain" | "phone" | "name+city" } // someone else's lead
  | null;

/**
 * Same matching the Task 4 reconciliation used, so the importer's
 * "already a lead" count agrees with the report the owner saw. A lead with the
 * same dedupeKey that THIS importer wrote is an update target (idempotent
 * re-run); every other match is left strictly alone.
 */
export function matchExistingLead(d: DealerRecord, idx: LeadIndex): LeadMatch {
  if (d.dedupeKey !== "") {
    const same = idx.byKey.get(d.dedupeKey);
    if (same) return isDealerImportLead(same) ? { kind: "UPDATE", lead: same } : { kind: "SKIP", via: "dedupeKey" };
  }
  const dk = domainKey(d.website);
  if (dk && idx.domains.has(dk)) return { kind: "SKIP", via: "domain" };
  const pk = phoneKey(d.phone);
  if (pk && idx.phones.has(pk)) return { kind: "SKIP", via: "phone" };
  const nk = nameKey(d.name);
  if (nk.length >= 4) {
    const cities = new Set([d.city, ...d.locations.map((x) => x.city)].map((c) => c.trim().toLowerCase()).filter(Boolean));
    for (const c of cities) if (idx.nameCity.has(`${nk}:${c}`)) return { kind: "SKIP", via: "name+city" };
  }
  return null;
}

// ---- building / merging the Lead payload ----------------------------------------------------

export type LeadPlan = {
  tier: Tier;
  locationId: string | null;
  geo: ResolvedGeo;
  milesFromHub: number | null;
  batchFile: string;
};

/** meta written by the importer. website lives here because Lead has no website column. */
export function buildMeta(d: DealerRecord, plan: LeadPlan): Record<string, unknown> {
  return {
    importSource: IMPORT_SOURCE,
    importFile: plan.batchFile,
    brands: d.brands,
    brandCount: d.brands.length,
    tier: plan.tier,
    ...(d.website ? { website: d.website } : {}),
    ...(d.locations.length > 1 ? { locations: d.locations } : {}),
    ...(plan.milesFromHub != null ? { milesFromHub: Math.round(plan.milesFromHub) } : {}),
    ...(plan.geo.repairedFromZip ? { stateRepairedFromZip: { was: d.state, now: plan.geo.state } } : {}),
  };
}

/** The data for a NEW Lead (everything except importBatchId, which the CLI adds). */
export function buildNewLead(d: DealerRecord, plan: LeadPlan) {
  return {
    companyName: d.name,
    phone: cleanPhone(d.phone),
    email: d.email.trim() || null,
    city: d.city.trim() || null,
    // Only a state we recognise (US code or Canadian province, after repair) is written;
    // junk such as "BC CANADA", "817" or "LAA" must not sit in a rep-visible, filterable column.
    state: plan.geo.state && countryFromState(plan.geo.state) !== "OTHER" ? plan.geo.state : null,
    country: plan.geo.country,
    type: leadTypeFor(d),
    source: "PROSPECTING" as const,
    interest: "WHEELS" as const,
    stage: "NEW_LEAD" as const,
    locationId: plan.locationId,
    dedupeKey: d.dedupeKey,
    meta: buildMeta(d, plan),
  };
}

export type MergeableLead = {
  assignedRepId: string | null;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  state?: string | null;
  locationId?: string | null;
  /** ProspectPool; only read to avoid re-writing an exclusion that is already there. */
  pool?: string | null;
  /** Calibration verdict timestamp; null = still in the /prospecting queue. */
  reviewedAt?: Date | null;
  rejectReason?: string | null;
  meta?: unknown;
};

/**
 * Re-import of a dealer whose dedupeKey is already a Lead: an UPDATE that
 * never clobbers human work.
 *
 *  - assignedRepId is returned exactly as it is on the existing row. (The CLI
 *    drops it from the write itself: sending even an unchanged value could
 *    overwrite a claim made between the read and the write.)
 *  - stage, type, source, notes, activities are never touched.
 *  - Scalar columns are only FILLED when empty; a rep's edits win.
 *  - meta is merged: the existing keys are kept (website, contacts, outreach
 *    drafts), and only the importer's own fields are refreshed.
 */
export function mergeIntoExisting(
  existing: MergeableLead,
  d: DealerRecord,
  plan?: LeadPlan,
  now: Date = new Date(),
): { assignedRepId: string | null } & Record<string, unknown> {
  const out: { assignedRepId: string | null } & Record<string, unknown> = {
    assignedRepId: existing.assignedRepId,
  };
  if (!plan) return out;

  const fresh = buildNewLead(d, plan);
  const fill = ["phone", "email", "city", "state", "locationId"] as const;
  for (const f of fill) {
    const cur = existing[f];
    if ((cur === null || cur === undefined || cur === "") && fresh[f] !== null) out[f] = fresh[f];
  }

  const oldMeta = metaObject(existing.meta);
  const newMeta = { ...oldMeta, ...buildMeta(d, plan) };
  // A website a rep or enrichment already stored is never replaced by the list's.
  if (oldMeta.website !== undefined) newMeta.website = oldMeta.website;
  if (stableStringify(newMeta) !== stableStringify(oldMeta)) out.meta = newMeta;

  // The dealer has become a customer since this lead was created (the importer only reaches an update
  // for a Customer-table match through this path). Tier 1 already ranks it last, but a rep must never be
  // handed an existing customer to cold-call (spec section 7), so exclude it outright: the My Work query
  // drops pool D_EXCLUDED. It is also stamped reviewed: /prospecting's queue is "reviewedAt is null", so an
  // excluded-but-unreviewed lead would sit there where a manager could FOLLOW it and assign a rep. A human
  // verdict already on the lead is never overwritten, and each field is written only when it would change,
  // so a re-run stays a no-op.
  if (plan.tier === 1) {
    if (existing.pool !== "D_EXCLUDED") out.pool = "D_EXCLUDED";
    if (!existing.reviewedAt) {
      out.reviewedAt = now;
      if (!existing.rejectReason) out.rejectReason = "Dealer is now an existing customer (import re-run); cross-sell, not a prospect";
    }
  }
  return out;
}

/** JSON with sorted keys: Postgres jsonb does not preserve key order, so a plain compare would report phantom changes. */
function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}

/** True when a merge would change nothing except echoing assignedRepId. */
export function isNoopMerge(merged: Record<string, unknown>): boolean {
  return Object.keys(merged).every((k) => k === "assignedRepId");
}

// ---- cross-sell tasks for dealers that are already customers -------------------------------------

/** The slice of a Customer row the cross-sell rule needs (no Prisma types in this package). */
export type CrossSellCustomer = {
  id: string;
  companyName: string;
  assignedRepId: string | null;
  locationId: string | null;
  /** CustomerStatus as a string (the services package does not import Prisma enums). */
  status?: string;
};

/** Shape of a Task row to create (status is omitted: the schema defaults it to OPEN). */
export type TaskInput = {
  title: string;
  description: string;
  dueDate: Date;
  priority: "MEDIUM";
  type: "FOLLOW_UP";
  customerId: string;
  assigneeId: string;
  locationId: string | null;
  creatorId: string;
};

export type CrossSellFlags = {
  /** findBlacklistMatch() hit: a blacklisted company never gets a task, even if it is a customer. */
  blacklisted?: boolean;
  /** Task.creatorId is required. The importer passes the resolved actor; defaults to the assigned rep. */
  creatorId?: string;
  /** Injected clock for the due date (tests). Defaults to the current time. */
  now?: Date;
};

/** Days between the importer run and the cross-sell task falling due. */
export const CROSS_SELL_DUE_DAYS = 7;

/** Prefix of the marker embedded in Task.description; the importer's re-run dedupe keys on it. */
export const CROSS_SELL_MARKER_PREFIX = "dealer-xsell:";

/**
 * Dedupe identity of a cross-sell task: the CUSTOMER, not the dealer record. One
 * rep, one account, one nudge. Keying on the dealer would create several tasks
 * for one account when branch records resolve to it, and would duplicate the
 * task whenever a later workbook export changes a dealer's dedupeKey (e.g. it
 * gains a website). Always the first line of Task.description.
 */
export function crossSellMarker(customerId: string): string {
  return `[${CROSS_SELL_MARKER_PREFIX}${customerId}]`;
}

/** Reads the customer id back out of a task description's first line; null when it is not a cross-sell marker. */
export function crossSellCustomerIdOf(description: string | null | undefined): string | null {
  const first = (description ?? "").split("\n", 1)[0].trim();
  const open = `[${CROSS_SELL_MARKER_PREFIX}`;
  if (!first.startsWith(open) || !first.endsWith("]")) return null;
  const id = first.slice(open.length, -1);
  return id.length > 0 ? id : null;
}

/**
 * Two lookups (by phone, by domain) can resolve to different customers. Prefer the
 * one that has an assigned rep, so a rep-less row never masks a rep-owned one;
 * on a tie the first argument (phone) wins.
 */
export function pickCrossSellCustomer<T extends { assignedRepId: string | null }>(
  byPhone: T | undefined,
  byDomain: T | undefined,
): T | undefined {
  if (byPhone && byDomain && byPhone !== byDomain && !byPhone.assignedRepId && byDomain.assignedRepId) return byDomain;
  return byPhone ?? byDomain;
}

/** Customer statuses that must never receive a sales cross-sell task. */
export const CROSS_SELL_BLOCKED_STATUSES: readonly string[] = ["DO_NOT_CONTACT", "LOST", "INACTIVE"];

export type CrossSellBlock =
  | "BAD_STATUS" // DO_NOT_CONTACT / LOST / INACTIVE
  | "NO_REP" // customer.assignedRepId is empty
  | "NO_CUSTOMER_LOCATION" // customer.locationId is null
  | "REP_INACTIVE" // the assignee is deactivated, or no such user row
  | "REP_LOCATION_MISMATCH"; // the assignee belongs to another location than the customer

export type CrossSellRep = { active: boolean; locationId: string | null };

/**
 * Why a customer must NOT get a task, or null when it may. Location rules: /tasks
 * filters by rep scope AND location scope, so a task whose locationId is one
 * company's and whose assignee is the other's is visible to nobody (and breaks
 * the Rhino/Everflow isolation). The task is never "fixed" by falling back to
 * the assignee's location: the mismatch is data to report, not to paper over.
 */
export function crossSellBlockReason(customer: CrossSellCustomer, rep: CrossSellRep | undefined): CrossSellBlock | null {
  if (customer.status && CROSS_SELL_BLOCKED_STATUSES.includes(customer.status)) return "BAD_STATUS";
  if (!customer.assignedRepId) return "NO_REP";
  if (!customer.locationId) return "NO_CUSTOMER_LOCATION";
  if (!rep || !rep.active) return "REP_INACTIVE";
  if (rep.locationId !== customer.locationId) return "REP_LOCATION_MISMATCH";
  return null;
}

/**
 * A dealer on the list who is already a customer is an upsell, not a prospect:
 * the task goes to the rep who already owns the account. Returns null when no
 * task should exist: the company is blacklisted, or the customer has no
 * assigned rep (the caller reports that case, it must not vanish silently).
 */
export function crossSellTaskFor(
  customer: CrossSellCustomer,
  d: DealerRecord,
  flags: CrossSellFlags = {},
): TaskInput | null {
  if (flags.blacklisted) return null;
  const rep = customer.assignedRepId;
  if (!rep) return null;

  const now = flags.now ?? new Date();
  const dueDate = new Date(now.getTime() + CROSS_SELL_DUE_DAYS * 24 * 60 * 60 * 1000);
  const brands = d.brands.length > 0 ? d.brands.join(", ") : null;
  const where = [d.city, d.state].map((s) => s.trim()).filter(Boolean).join(", ");

  return {
    title: brands
      ? `Cross-sell wheels: ${customer.companyName} carries ${brands}`
      : `Cross-sell wheels: ${customer.companyName} is on the wheel dealer list`,
    description: [
      crossSellMarker(customer.id),
      `${customer.companyName} is already a customer and also appears on the wheel dealer list` +
        (where ? ` (${where})` : "") +
        ".",
      brands ? `Brands they carry: ${brands}.` : "No brands recorded on the list.",
      "Reach out and offer our wheel and ATV lines.",
      // Provenance only. The dedupe key is the customer marker on line 1, never this.
      `Dealer list record: ${d.name} [dedupeKey ${d.dedupeKey || "none"}]`,
    ].join("\n"),
    dueDate,
    priority: "MEDIUM",
    type: "FOLLOW_UP",
    customerId: customer.id,
    assigneeId: rep,
    locationId: customer.locationId,
    creatorId: flags.creatorId ?? rep,
  };
}

export type CrossSellCandidate = { companyName?: string | null; website?: string | null; phone?: string | null };

/**
 * Blacklist test for a cross-sell task. Checks the dealer's identity AND the
 * resolved customer's: a blacklist row with no domain or phone matches only on an
 * equal company name, and the customer's registered name can differ from the name
 * the dealer list uses. `isBlacklisted` is injected (the importer passes
 * matchesExclusion over the BLACKLIST rows) so this module imports no DB code.
 */
export function crossSellBlacklisted(
  d: Pick<DealerRecord, "name" | "website" | "phone">,
  customer: { companyName: string; website: string | null; phone: string | null } | undefined,
  isBlacklisted: (c: CrossSellCandidate) => unknown,
): boolean {
  if (isBlacklisted({ companyName: d.name, website: d.website, phone: d.phone })) return true;
  return !!customer && !!isBlacklisted({ companyName: customer.companyName, website: customer.website, phone: customer.phone });
}
