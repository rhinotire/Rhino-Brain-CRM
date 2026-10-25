// packages/database/scripts/import-dealers.ts
/**
 * Gated dealer-list importer (Task 6). Turns the parsed multi-brand wheel
 * dealer workbook into Lead rows, tagged with ONE ImportBatch.
 *
 *   cd packages/database
 *   npx tsx scripts/import-dealers.ts --file <workbook.xlsx> --territory rhino|everflow|all [--limit N] [--dry]
 *
 *   --file        the Dealer-Locators workbook (required)
 *   --territory   rhino | everflow | all   (required; "all" = every parsed dealer,
 *                 home states to their location, non-home US to locationId=null,
 *                 Canada and unresolved states also locationId=null: parked, no rep sees them)
 *   --limit N     import at most N dealers, best release order first (tier, brands, email)
 *   --dry         classify and count only. Writes NOTHING. A write-blocking Prisma
 *                 extension makes that structural, not a convention.
 *   --yes         REQUIRED for a real (non --dry) run. A real run writes to whatever
 *                 DATABASE_URL points at (production).
 *   --coords <p>  Fuel scrape workbook for lat/lng (default: Fuel_Off_Road_Dealers*.xlsx
 *                 beside --file; "none" disables)
 *   --no-zip-centroid   do not fall back to the top-level ZIP centroid for distance
 *   --user <email>      owner of the ImportBatch (default: first ADMIN)
 *
 * Rules live in packages/services/src/dealer-import-rules.ts (unit-tested).
 * Per record, in this order: exclusion + blacklist gates, existing-lead check,
 * non-dedupable skip, then create. Idempotent: a dealer already imported is
 * updated in place (blank fields filled, assignedRepId and stage never
 * touched) or left alone; a dealer matching any OTHER lead is skipped.
 *
 * Dealers that are already customers get no Lead; instead the owning rep gets a
 * cross-sell Task (crossSellTaskFor). Written BEFORE the "nothing to write" early
 * return, so it still runs against an already-imported list. Re-runs are deduped per CUSTOMER by
 * the marker (customer id) on the first line of Task.description. Records matching only an
 * ExclusionList EXISTING_CUSTOMER row (no Customer row, so no owner) are listed as
 * UNRESOLVED in the summary, never dropped silently.
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import { existsSync, readdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { parseDealerWorkbook, type DealerRecord } from "../../services/src/dealer-list-parse";
import { attachCoordinates, type GeoDealerRecord } from "../../services/src/dealer-cluster";
import { matchesExclusion, isExcluded, findBlacklistMatch } from "../../services/src/exclusion-service";
import { domainKey, phoneKey } from "../../services/src/referral-matching";
import { readCoordinateCandidates } from "../../services/src/dealer-coordinates-file";
import {
  shouldImport,
  resolveGeo,
  locationForRecord,
  homeCompanyOf,
  milesToHomeHub,
  pickCoordinate,
  tierForRecord,
  buildDensityIndex,
  densityOf,
  buildLeadIndex,
  matchExistingLead,
  buildNewLead,
  mergeIntoExisting,
  isNoopMerge,
  leadTypeFor,
  cleanPhone,
  crossSellTaskFor,
  crossSellCustomerIdOf,
  crossSellBlockReason,
  crossSellBlacklisted,
  pickCrossSellCustomer,
  importBatchFigures,
  needsImportBatch,
  CROSS_SELL_MARKER_PREFIX,
  type TaskInput,
  type CrossSellBlock,
  type LeadPlan,
  type SkipReason,
  type ExistingLeadRow,
} from "../../services/src/dealer-import-rules";

const argv = process.argv.slice(2);
const DRY = argv.includes("--dry");
const flag = (name: string) => argv.includes(`--${name}`);
function arg(name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith("--")) {
    console.error(`--${name} requires a value`);
    process.exit(2);
  }
  return v;
}

const WRITE_OPS = new Set(["create", "createMany", "createManyAndReturn", "update", "updateMany", "upsert", "delete", "deleteMany"]);
const base = new PrismaClient();
// In --dry the client physically cannot write: any mutating operation throws.
const db = DRY
  ? base.$extends({
      query: {
        $allModels: {
          $allOperations({ model, operation, args, query }) {
            if (WRITE_OPS.has(operation)) throw new Error(`DRY RUN: blocked ${model}.${operation}`);
            return query(args);
          },
        },
      },
    })
  : base;

type Territory = "Rhino" | "Everflow" | "Other US" | "Canada" | "Unresolved";
const TERRITORIES: Territory[] = ["Rhino", "Everflow", "Other US", "Canada", "Unresolved"];
function territoryOf(d: DealerRecord): Territory {
  const home = homeCompanyOf(d);
  if (home === "RHINO") return "Rhino";
  if (home === "EVERFLOW") return "Everflow";
  const g = resolveGeo(d);
  return g.country === "US" ? "Other US" : g.country === "CA" ? "Canada" : "Unresolved";
}

const pad = (s: string | number, n: number) => String(s).padEnd(n);
const num = (s: string | number, n: number) => String(s).padStart(n);
const bump = <K extends string | number>(m: Record<K, number>, k: K) => (m[k] = (m[k] ?? 0) + 1);

type Planned = {
  d: DealerRecord;
  territory: Territory;
  plan: LeadPlan;
  coordSource: "scrape" | "zip" | "none";
  phoneNulled: boolean;
};
type Row =
  | { kind: "create"; p: Planned }
  | { kind: "update"; p: Planned; lead: ExistingLeadRow & { assignedRepId: string | null; email: string | null; state: string | null; locationId: string | null } }
  | { kind: "unchanged"; p: Planned }
  | { kind: "skip"; p: Planned; reason: SkipReason | "EXISTING_CUSTOMER" | "DUPLICATE_IN_FILE"; via?: string };

async function pool<T>(items: T[], size: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

async function main() {
  const fileArg = arg("file");
  const territoryArg = arg("territory");
  if (!fileArg || !territoryArg || !["rhino", "everflow", "all"].includes(territoryArg)) {
    console.error("usage: tsx scripts/import-dealers.ts --file <workbook.xlsx> --territory rhino|everflow|all [--limit N] [--dry]");
    process.exit(2);
  }
  if (!DRY && !flag("yes")) {
    console.error("Refusing a REAL import without --yes (this writes to the database DATABASE_URL points at). Use --dry to preview.");
    process.exit(2);
  }
  const limitArg = arg("limit");
  const limit = limitArg === undefined ? Infinity : Number(limitArg);
  if (!(limit > 0) || (limit !== Infinity && !Number.isInteger(limit))) {
    console.error("--limit must be a positive integer");
    process.exit(2);
  }
  const zipCentroid = !flag("no-zip-centroid");
  const file = resolve(fileArg);
  console.log(`${DRY ? "DRY RUN (no writes)" : "REAL IMPORT"} | territory=${territoryArg} | limit=${limit === Infinity ? "none" : limit} | file=${basename(file)}`);

  // ---- inputs ---------------------------------------------------------------------
  const all = await parseDealerWorkbook(file);
  console.log(`Parsed ${all.length} unique dealer records`);

  let coordPath = arg("coords");
  if (coordPath === undefined) {
    const found = readdirSync(dirname(file)).find((f) => /^Fuel_Off_Road_Dealers.*\.xlsx$/i.test(f));
    if (found) coordPath = join(dirname(file), found);
  }
  const coordsByKey = coordPath && coordPath !== "none" ? await readCoordinateCandidates(resolve(coordPath)) : new Map();
  console.log(`Coordinates: ${coordPath && coordPath !== "none" ? `${basename(coordPath)} (${coordsByKey.size} keys)` : "none"}; ZIP-centroid fallback ${zipCentroid ? "ON" : "OFF"}`);

  // ---- read-only DB snapshot ---------------------------------------------------------
  const exclusionRows = await db.exclusionList.findMany({ select: { kind: true, companyName: true, domain: true, phone: true } });
  const blacklistRows = exclusionRows.filter((r) => r.kind === "BLACKLIST");
  const leadRows = await db.lead.findMany({
    select: { id: true, companyName: true, phone: true, city: true, dedupeKey: true, meta: true, assignedRepId: true, email: true, state: true, locationId: true, pool: true },
  });
  const leadIdx = buildLeadIndex(leadRows);
  const leadById = new Map(leadRows.map((l) => [l.id, l]));
  const customers = await db.customer.findMany({
    select: { id: true, companyName: true, phone: true, website: true, assignedRepId: true, locationId: true, status: true },
  });
  const custPhones = new Set(customers.map((c) => phoneKey(c.phone)).filter(Boolean));
  const custDomains = new Set(customers.map((c) => domainKey(c.website)).filter(Boolean));
  // Same keys, resolved to the actual Customer row (cross-sell tasks need the owner). When several
  // customers share a key, one that has an assigned rep wins over one that does not.
  type CustomerRow = (typeof customers)[number];
  const custByPhone = new Map<string, CustomerRow>();
  const custByDomain = new Map<string, CustomerRow>();
  const keepBetter = (m: Map<string, CustomerRow>, k: string, c: CustomerRow) => {
    const cur = m.get(k);
    if (!cur || (!cur.assignedRepId && c.assignedRepId)) m.set(k, c);
  };
  for (const c of customers) {
    const pk = phoneKey(c.phone);
    if (pk) keepBetter(custByPhone, pk, c);
    const dk = domainKey(c.website);
    if (dk) keepBetter(custByDomain, dk, c);
  }

  // Every home-state rep assignment rides on these two ids. Location.shortTag is NOT unique in the
  // schema, so require exactly ONE ACTIVE match per tag (refuse on 0 or 2+) and print the names.
  // Qingdao is deliberately not resolved: Canada is parked with a null location.
  const resolveLoc = async (tag: string): Promise<{ id: string; name: string } | null> => {
    const hits = await db.location.findMany({ where: { shortTag: tag, active: true }, select: { id: true, name: true } });
    if (hits.length > 1) {
      console.error(`Ambiguous location: ${hits.length} ACTIVE locations have shortTag "${tag}" (${hits.map((h) => h.name).join(", ")}). Refusing to route dealers.`);
      process.exit(1);
    }
    return hits[0] ?? null;
  };
  const flLoc = await resolveLoc("FL");
  const txLoc = await resolveLoc("TX");
  const ids = { rhino: flLoc?.id ?? null, everflow: txLoc?.id ?? null, qingdao: null as string | null };
  const needs = territoryArg === "rhino" ? ["rhino"] : territoryArg === "everflow" ? ["everflow"] : ["rhino", "everflow"];
  for (const n of needs) {
    if (!ids[n as "rhino" | "everflow"]) {
      console.error(`No active location found for "${n}" (shortTag FL / TX). Refusing to route dealers to a null location.`);
      process.exit(1);
    }
  }
  console.log(`Resolved locations: FL -> ${flLoc ? `"${flLoc.name}" (${flLoc.id})` : "none"} | TX -> ${txLoc ? `"${txLoc.name}" (${txLoc.id})` : "none"} | Canada/non-home US/unresolved -> null (no rep)`);
  const admin = arg("user")
    ? await db.user.findFirst({ where: { email: arg("user") }, select: { id: true, email: true } })
    : await db.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" }, select: { id: true, email: true } });
  if (!admin) {
    console.error("No user found to own the ImportBatch (pass --user <email>).");
    process.exit(1);
  }
  console.log(
    `Snapshot: ${exclusionRows.length} ExclusionList rows (${blacklistRows.length} BLACKLIST), ${leadRows.length} Leads, ${customers.length} Customers; ` +
      `batch owner=${admin.email}`,
  );

  // ---- plan every record -----------------------------------------------------------
  const density = buildDensityIndex(all);
  const batchFile = basename(file);
  const planned: Planned[] = all.map((d0) => {
    const geo = resolveGeo(d0);
    const candidates = coordsByKey.get(d0.dedupeKey) ?? [];
    const pick = d0.dedupeKey ? pickCoordinate(d0, candidates) : null;
    // attachCoordinates is the project's join; fed exactly one row, chosen for the TOP-LEVEL city.
    const d: GeoDealerRecord = pick ? attachCoordinates([d0], [{ dedupeKey: d0.dedupeKey, ...pick }])[0] : d0;
    const miles = milesToHomeHub(d, geo.state, { zipCentroid });
    const coordSource: Planned["coordSource"] = miles === null ? "none" : pick ? "scrape" : "zip";
    const cand = { companyName: d.name, website: d.website, phone: d.phone };
    const isExistingCustomer =
      !!matchesExclusion(cand, exclusionRows.filter((r) => r.kind === "EXISTING_CUSTOMER")) ||
      (!!phoneKey(d.phone) && custPhones.has(phoneKey(d.phone))) ||
      (!!domainKey(d.website) && custDomains.has(domainKey(d.website)));
    const tier = tierForRecord(d0, geo, { milesFromHub: miles, isExistingCustomer, density: densityOf(d0, density) });
    return {
      d: d0,
      territory: territoryOf(d0),
      plan: { tier, locationId: locationForRecord(d0, ids), geo, milesFromHub: miles, batchFile },
      coordSource,
      phoneNulled: d0.phone.trim() !== "" && cleanPhone(d0.phone) === null,
    };
  });

  // Territory selection, then release order (tier, more brands, has email, name) so --limit takes the best first.
  const inScope = planned
    .filter((p) => (territoryArg === "all" ? true : territoryArg === "rhino" ? p.territory === "Rhino" : p.territory === "Everflow"))
    .sort(
      (a, b) =>
        a.plan.tier - b.plan.tier ||
        b.d.brands.length - a.d.brands.length ||
        Number(b.d.email.trim() !== "") - Number(a.d.email.trim() !== "") ||
        a.d.name.localeCompare(b.d.name),
    );

  // ---- gates ------------------------------------------------------------------------
  // --limit counts dealers that would actually be CREATED (so the best N importable ones,
  // not N rows of which the first ones are all excluded customers).
  const rows: Row[] = [];
  const seenKeys = new Set<string>();
  let createCount = 0;
  const examined: Planned[] = [];
  for (const p of inScope) {
    if (createCount >= limit) break;
    examined.push(p);
    const d = p.d;
    const cand = { companyName: d.name, website: d.website, phone: d.phone };
    const blacklisted = !!matchesExclusion(cand, blacklistRows);
    const excluded = !!matchesExclusion(cand, exclusionRows); // isExcluded() semantics: any kind
    const match = matchExistingLead(d, leadIdx);
    const customerTable =
      (!!phoneKey(d.phone) && custPhones.has(phoneKey(d.phone))) || (!!domainKey(d.website) && custDomains.has(domainKey(d.website)));

    const decision = shouldImport(d, { blacklisted, excluded, alreadyLead: match?.kind === "SKIP" });
    if (!decision.ok) {
      rows.push({ kind: "skip", p, reason: decision.reason, via: match?.kind === "SKIP" ? match.via : undefined });
      continue;
    }
    // A live Customer the ExclusionList does not cover is still not a cold prospect.
    if (customerTable && match?.kind !== "UPDATE") {
      rows.push({ kind: "skip", p, reason: "EXISTING_CUSTOMER" });
      continue;
    }
    if (match?.kind === "UPDATE") {
      const lead = leadById.get(match.lead.id)!;
      const merged = mergeIntoExisting(lead, d, p.plan);
      rows.push(isNoopMerge(merged) ? { kind: "unchanged", p } : { kind: "update", p, lead });
      continue;
    }
    if (seenKeys.has(d.dedupeKey)) {
      rows.push({ kind: "skip", p, reason: "DUPLICATE_IN_FILE" });
      continue;
    }
    seenKeys.add(d.dedupeKey);
    rows.push({ kind: "create", p });
    createCount++;
  }

  // ---- report counts ------------------------------------------------------------------
  const creates = rows.filter((r): r is Extract<Row, { kind: "create" }> => r.kind === "create");
  const updates = rows.filter((r): r is Extract<Row, { kind: "update" }> => r.kind === "update");
  const unchanged = rows.filter((r) => r.kind === "unchanged");
  const skips = rows.filter((r): r is Extract<Row, { kind: "skip" }> => r.kind === "skip");

  // ---- cross-sell tasks: dealers that are already customers ------------------------------
  // Independent of the lead classification above: a dealer that is a customer may have been
  // skipped as EXCLUDED / ALREADY_LEAD / EXISTING_CUSTOMER, and every one of them is an upsell.
  // Creates no Lead. Dedupe is per CUSTOMER: line 1 of Task.description is crossSellMarker(customerId);
  // existing tasks are read once here (a read, so --dry runs it too) and a customer that already has
  // one, or already has one planned in this run, gets no second task.
  const existingXsell = await db.task.findMany({
    where: { description: { contains: CROSS_SELL_MARKER_PREFIX } },
    select: { description: true },
  });
  const xsellDone = new Set<string>(); // customers with a task from an earlier run
  const xsellPlanned = new Set<string>(); // customers planned in THIS run
  for (const t of existingXsell) {
    const cid = crossSellCustomerIdOf(t.description);
    if (cid) xsellDone.add(cid);
  }
  // Assignee validation: one query over every rep id that owns a customer.
  const repIds = [...new Set(customers.map((c) => c.assignedRepId).filter((x): x is string => !!x))];
  const repRows = repIds.length
    ? await db.user.findMany({ where: { id: { in: repIds } }, select: { id: true, active: true, locationId: true } })
    : [];
  const repById = new Map(repRows.map((u) => [u.id, { active: u.active, locationId: u.locationId }]));
  const existingCustRows = exclusionRows.filter((r) => r.kind === "EXISTING_CUSTOMER");
  type XsellPlan = { d: DealerRecord; customer: CustomerRow; task: TaskInput };
  const xsellNew: XsellPlan[] = [];
  const xsellDeduped: string[] = []; // the customer already has a cross-sell task from an earlier run
  const xsellSameCustomer: string[] = []; // a second record for a customer already planned in THIS run
  const xsellUnresolved: string[] = []; // matched an ExclusionList EXISTING_CUSTOMER row only: no owner to assign
  const xsellBlacklisted: string[] = [];
  const xsellBlocks: Record<CrossSellBlock, string[]> = {
    BAD_STATUS: [],
    NO_REP: [],
    NO_CUSTOMER_LOCATION: [],
    REP_INACTIVE: [],
    REP_LOCATION_MISMATCH: [],
  };
  let xsellRecords = 0;
  for (const p of examined) {
    const d = p.d;
    const cand = { companyName: d.name, website: d.website, phone: d.phone };
    const pk = phoneKey(d.phone);
    const dk = domainKey(d.website);
    const customer = pickCrossSellCustomer(pk ? custByPhone.get(pk) : undefined, dk ? custByDomain.get(dk) : undefined);
    const isCustomerRecord = !!customer || !!matchesExclusion(cand, existingCustRows);
    if (!isCustomerRecord) continue;
    xsellRecords++;
    const label = `${d.name} (${d.city}, ${d.state})`;
    // Blacklist is checked against the dealer's identity AND the resolved customer's: a name-only
    // blacklist row matches only on an equal name, and the customer's name may differ from the dealer's.
    const blacklisted = crossSellBlacklisted(d, customer, (c) => matchesExclusion(c, blacklistRows));
    if (blacklisted) {
      xsellBlacklisted.push(customer ? `${label} -> ${customer.companyName}` : label);
      continue;
    }
    if (!customer) {
      xsellUnresolved.push(label);
      continue;
    }
    const withCustomer = `${label} -> ${customer.companyName}`;
    const block = crossSellBlockReason(customer, customer.assignedRepId ? repById.get(customer.assignedRepId) : undefined);
    if (block) {
      xsellBlocks[block].push(withCustomer);
      continue;
    }
    if (xsellDone.has(customer.id)) {
      xsellDeduped.push(withCustomer);
      continue;
    }
    if (xsellPlanned.has(customer.id)) {
      xsellSameCustomer.push(withCustomer);
      continue;
    }
    const task = crossSellTaskFor(customer, d, { creatorId: admin.id, blacklisted });
    if (!task) {
      // Unreachable while crossSellBlockReason passed (rep present, not blacklisted): never drop silently.
      throw new Error(`cross-sell invariant broken for ${withCustomer}`);
    }
    xsellNew.push({ d, customer, task });
    xsellPlanned.add(customer.id);
  }

  const grid: Record<string, Record<Territory, number>> = {};
  const row0 = () => Object.fromEntries(TERRITORIES.map((t) => [t, 0])) as Record<Territory, number>;
  const addGrid = (label: string, t: Territory) => {
    grid[label] ??= row0();
    grid[label][t]++;
  };
  const byTier: Record<number, Record<Territory, number>> = {};
  const byType: Record<string, number> = {};
  const byLoc: Record<string, number> = {};
  const coordSrc: Record<string, number> = {};
  const skipReasons: Record<string, number> = {};
  let phonesNulled = 0;
  const repairs: string[] = [];
  const nullKeyWrites = creates.filter((c) => !c.p.d.dedupeKey).length;
  for (const c of creates) {
    const { d, territory, plan } = c.p;
    addGrid("WOULD CREATE", territory);
    (byTier[plan.tier] ??= row0())[territory]++;
    bump(byType, leadTypeFor(d));
    bump(byLoc, plan.locationId === null ? "null (no rep)" : plan.locationId === ids.rhino ? "Rhino (FL)" : plan.locationId === ids.everflow ? "Everflow (TX)" : "UNEXPECTED");
    if (territory === "Rhino" || territory === "Everflow") bump(coordSrc, c.p.coordSource);
    if (c.p.phoneNulled) phonesNulled++;
  }
  for (const r of rows) if (r.p.plan.geo.repairedFromZip) repairs.push(`${r.p.d.name} (${r.p.d.city}): "${r.p.d.state}" + ${r.p.d.zip} -> ${r.p.plan.geo.state} [${r.kind}${r.kind === "skip" ? `:${r.reason}` : ""}]`);
  for (const s of skips) {
    addGrid(`SKIP ${s.reason}`, s.p.territory);
    bump(skipReasons, s.via ? `${s.reason} via ${s.via}` : s.reason);
  }
  for (const u of updates) addGrid("WOULD UPDATE (fill blanks)", u.p.territory);
  for (const u of unchanged) addGrid("UNCHANGED (already imported)", u.p.territory);

  const sumT = (g: Record<Territory, number>) => TERRITORIES.reduce((a, t) => a + g[t], 0);
  const out: string[] = [];
  const P = (s = "") => out.push(s);
  P("");
  P(`=== ${DRY ? "DRY RUN" : "PLAN"}: ${examined.length} dealers examined (territory=${territoryArg}, ${inScope.length} in territory) of ${all.length} parsed ===`);
  P(pad("", 32) + TERRITORIES.map((t) => num(t, 12)).join("") + num("Total", 8));
  for (const [label, g] of Object.entries(grid)) P(pad(label, 32) + TERRITORIES.map((t) => num(g[t], 12)).join("") + num(sumT(g), 8));
  const accounted = creates.length + updates.length + unchanged.length + skips.length;
  P(`accounted: ${accounted} of ${examined.length} examined ${accounted === examined.length ? "(sums exactly)" : "MISMATCH!"}`);
  P("");
  P("=== WOULD CREATE: by tier x territory ===");
  P(pad("", 10) + TERRITORIES.map((t) => num(t, 12)).join("") + num("Total", 8));
  for (const t of Object.keys(byTier).map(Number).sort((a, b) => a - b)) P(pad(`Tier ${t}`, 10) + TERRITORIES.map((x) => num(byTier[t][x], 12)).join("") + num(sumT(byTier[t]), 8));
  P("");
  P("=== WOULD CREATE: by type ===");
  for (const [k, v] of Object.entries(byType)) P(`${pad(k, 14)}${num(v, 6)}`);
  P("");
  P("=== WOULD CREATE: by locationId ===");
  for (const [k, v] of Object.entries(byLoc)) P(`${pad(k, 16)}${num(v, 6)}`);
  P("");
  P("=== SKIPPED, by reason ===");
  for (const [k, v] of Object.entries(skipReasons).sort()) P(`${pad(k, 34)}${num(v, 6)}`);
  P(`${pad("TOTAL skipped", 34)}${num(skips.length, 6)}`);
  P("");
  P("=== distance source for home-state creates ===");
  for (const [k, v] of Object.entries(coordSrc)) P(`${pad(k, 10)}${num(v, 6)}`);
  P("");
  P(`Junk phones that would be written as null: ${phonesNulled} (of creates)`);
  P(`Creates carrying an empty dedupeKey: ${nullKeyWrites} (must be 0)`);
  P(`State repaired from zip (${repairs.length}):`);
  for (const r of repairs) P(`    - ${r}`);
  P("");
  P("=== CROSS-SELL TASKS (dealers already in the customer book; no Lead is created) ===");
  P(`${pad("already-customer records", 34)}${num(xsellRecords, 6)}`);
  P(`${pad(DRY ? "tasks WOULD be created" : "tasks to create", 34)}${num(xsellNew.length, 6)}`);
  P(`${pad("already exist (deduped)", 34)}${num(xsellDeduped.length, 6)}`);
  P(`${pad("SAME CUSTOMER (2nd+ record)", 34)}${num(xsellSameCustomer.length, 6)}`);
  P(`${pad("UNRESOLVED customer (no task)", 34)}${num(xsellUnresolved.length, 6)}`);
  P(`${pad("customer has no rep (no task)", 34)}${num(xsellBlocks.NO_REP.length, 6)}`);
  P(`${pad("customer DNC/LOST/INACTIVE", 34)}${num(xsellBlocks.BAD_STATUS.length, 6)}`);
  P(`${pad("customer has no location", 34)}${num(xsellBlocks.NO_CUSTOMER_LOCATION.length, 6)}`);
  P(`${pad("rep inactive or missing", 34)}${num(xsellBlocks.REP_INACTIVE.length, 6)}`);
  P(`${pad("rep location != customer location", 34)}${num(xsellBlocks.REP_LOCATION_MISMATCH.length, 6)}`);
  P(`${pad("blacklisted skips (no task)", 34)}${num(xsellBlacklisted.length, 6)}`);
  const xsellBlockedN = Object.values(xsellBlocks).reduce((a, l) => a + l.length, 0);
  const xsellAccounted =
    xsellNew.length + xsellDeduped.length + xsellSameCustomer.length + xsellUnresolved.length + xsellBlockedN + xsellBlacklisted.length;
  P(`accounted: ${xsellAccounted} of ${xsellRecords} ${xsellAccounted === xsellRecords ? "(sums exactly)" : "MISMATCH!"}`);
  if (xsellAccounted !== xsellRecords) process.exitCode = 1;
  for (const [label, list] of [
    ["UNRESOLVED (matched only an ExclusionList EXISTING_CUSTOMER row; assign by hand)", xsellUnresolved],
    ["NO REP (customer has no assignedRepId; assign the account first)", xsellBlocks.NO_REP],
    ["CUSTOMER STATUS DO_NOT_CONTACT / LOST / INACTIVE (never given a sales task)", xsellBlocks.BAD_STATUS],
    ["CUSTOMER HAS NO LOCATION (set Customer.locationId, then re-run)", xsellBlocks.NO_CUSTOMER_LOCATION],
    ["REP INACTIVE OR MISSING (reassign the account, then re-run)", xsellBlocks.REP_INACTIVE],
    ["REP LOCATION != CUSTOMER LOCATION (task would be invisible on /tasks; fix the data, then re-run)", xsellBlocks.REP_LOCATION_MISMATCH],
    ["SAME CUSTOMER (another record already produced this customer's task)", xsellSameCustomer],
    ["BLACKLISTED (dealer or resolved customer)", xsellBlacklisted],
  ] as const) {
    if (list.length === 0) continue;
    P(`  ${label}:`);
    for (const n of list) P(`    - ${n}`);
  }
  if (xsellNew.length > 0) {
    P(`  tasks ${DRY ? "that would be created" : "to be created"}:`);
    for (const x of xsellNew) P(`    - [${x.task.assigneeId}] ${x.task.title}`);
  }
  console.log(out.join("\n"));

  if (DRY) {
    console.log("\nDRY RUN complete: zero writes (write operations are blocked on this client).");
    return;
  }

  // ---- REAL WRITE ---------------------------------------------------------------------
  // Cross-sell tasks FIRST: the lead section below returns early when there is nothing to create or
  // update, which is the case on every re-run of an already-imported list. Tasks must not depend on it.
  {
    let xsellCreated = 0;
    const xsellFailures: string[] = [];
    for (const x of xsellNew) {
      try {
        // Same live blacklist re-check the lead path uses, on exactly the rows about to be written.
        // Dealer identity AND the resolved customer's, as in the planning loop.
        const bl =
          (await findBlacklistMatch({ companyName: x.d.name, website: x.d.website, phone: x.d.phone })) ??
          (await findBlacklistMatch({ companyName: x.customer.companyName, website: x.customer.website, phone: x.customer.phone }));
        if (bl) {
          xsellFailures.push(`${x.d.name} -> ${x.customer.companyName}: BLOCKED by live blacklist check, no task written`);
          continue;
        }
        await db.task.create({ data: x.task });
        xsellCreated++;
      } catch (e) {
        xsellFailures.push(`${x.d.name}: ${e instanceof Error ? e.message.split("\n").pop() : e}`);
      }
    }
    console.log(`\nCross-sell tasks: created ${xsellCreated} of ${xsellNew.length} planned (${xsellDeduped.length} already existed, ${xsellSameCustomer.length} same customer, ${xsellUnresolved.length} unresolved, ${xsellBlockedN} blocked by customer/rep guards, ${xsellBlacklisted.length} blacklisted)`);
    for (const f of xsellFailures) console.log(`  CROSS-SELL NOT WRITTEN ${f}`);
    if (xsellFailures.length > 0 || xsellCreated !== xsellNew.length) process.exitCode = 1;
  }

  // The DB-backed gates run again on exactly the rows about to be created, so a blacklist
  // or exclusion row the in-memory snapshot somehow missed still stops the write.
  const gated: typeof creates = [];
  const gateBlockedNames: string[] = [];
  await pool(creates, 8, async (c) => {
    const cand = { companyName: c.p.d.name, website: c.p.d.website, phone: c.p.d.phone };
    const bl = await findBlacklistMatch(cand);
    const ex = bl ? null : await isExcluded(cand);
    if (bl || ex) gateBlockedNames.push(`${c.p.d.name} (${c.p.d.city}, ${c.p.d.state}) [${bl ? "BLACKLIST" : "EXCLUDED"}]`);
    else gated.push(c);
  });
  const gateBlocked = gateBlockedNames.length;
  console.log(`Live gate re-check: ${gated.length} clear, ${gateBlocked} blocked by findBlacklistMatch/isExcluded`);
  if (gateBlocked) {
    console.log("!! BLOCKED BY LIVE GATE (the in-memory snapshot had passed these):");
    for (const n of gateBlockedNames) console.log(`   - ${n}`);
    process.exitCode = 1; // the in-memory and live gates disagreed: surface it, never silently proceed
  }

  if (gated.length === 0 && updates.length === 0) {
    console.log("Nothing to write (re-run against an already-imported list). No ImportBatch created.");
    return;
  }

  // Only a run that creates leads gets an ImportBatch: an update-only re-run would leave a batch
  // holding zero leads, which reconcile --batch reports as NO DATA. Updates run either way.
  const batch = needsImportBatch(gated.length)
    ? await db.importBatch.create({
        data: { entity: "leads", fileName: batchFile, rowCount: examined.length, successful: 0, failed: 0, userId: admin.id },
      })
    : null;
  let createdN = 0;
  let createFailedN = 0; // creates that did not land (error OR silently dropped by skipDuplicates)
  let updateFailedN = 0;
  const failures: string[] = [];

  const toData = (c: (typeof gated)[number]): Prisma.LeadCreateManyInput => {
    if (!batch) throw new Error("toData called with no ImportBatch (nothing was gated for creation)");
    const n = buildNewLead(c.p.d, c.p.plan);
    if (!n.dedupeKey) throw new Error(`refusing empty dedupeKey for ${c.p.d.name}`);
    return { ...n, meta: n.meta as Prisma.InputJsonValue, importBatchId: batch.id };
  };
  for (let i = 0; batch && i < gated.length; i += 200) { // gated is empty when batch is null
    const chunk = gated.slice(i, i + 200);
    try {
      const r = await db.lead.createMany({ data: chunk.map(toData), skipDuplicates: true });
      createdN += r.count;
      if (r.count < chunk.length) {
        // skipDuplicates discards a dedupeKey collision silently. Find out exactly who was dropped:
        // everything in this chunk that did not land under THIS batch.
        const landed = new Set(
          (
            await db.lead.findMany({
              where: { importBatchId: batch.id, dedupeKey: { in: chunk.map((c) => c.p.d.dedupeKey) } },
              select: { dedupeKey: true },
            })
          ).map((l) => l.dedupeKey),
        );
        for (const c of chunk) {
          if (landed.has(c.p.d.dedupeKey)) continue;
          createFailedN++;
          failures.push(`${c.p.d.name} (${c.p.d.city}, ${c.p.d.state}): DROPPED by skipDuplicates, dedupeKey ${c.p.d.dedupeKey} already exists`);
        }
      }
    } catch (e) {
      for (const c of chunk) {
        try {
          await db.lead.create({ data: toData(c) });
          createdN++;
        } catch (e2) {
          createFailedN++;
          failures.push(`${c.p.d.name} (${c.p.d.city}, ${c.p.d.state}): ${e2 instanceof Error ? e2.message.split("\n").pop() : e2}`);
        }
      }
    }
    console.log(`  created ${createdN}/${gated.length}`);
  }

  let updatedN = 0;
  for (const u of updates) {
    // assignedRepId is deliberately dropped from the write: even re-sending the value we read
    // could overwrite a claim made after the read.
    const { assignedRepId: _preserved, ...data } = mergeIntoExisting(u.lead, u.p.d, u.p.plan);
    try {
      await db.lead.update({ where: { id: u.lead.id }, data: data as Prisma.LeadUncheckedUpdateInput });
      updatedN++;
    } catch (e) {
      updateFailedN++;
      failures.push(`UPDATE ${u.p.d.name}: ${e instanceof Error ? e.message.split("\n").pop() : e}`);
    }
  }

  // successful = CREATES only (see importBatchFigures): updates keep the batch their lead was first
  // imported under, so counting them here would make reconcile-dealers.ts cry MISMATCH on a healthy re-run.
  const figures = importBatchFigures({ created: createdN, createFailed: createFailedN, updated: updatedN, updateFailed: updateFailedN });
  if (batch) {
    await db.importBatch.update({ where: { id: batch.id }, data: { successful: figures.successful, failed: figures.failed } });
    console.log(`\nImportBatch ${batch.id}: created ${createdN}, failed ${figures.failed}, blocked by live gate ${gateBlocked}`);
  } else {
    console.log(`\nNo ImportBatch written (no new leads this run); failed ${figures.failed}, blocked by live gate ${gateBlocked}`);
  }
  console.log(`Updated in place: ${updatedN} (not recorded on the ImportBatch row, which has no column for it)`);
  for (const f of failures) console.log(`  FAILED ${f}`);

  // A shortfall must be impossible to miss: every gated row either landed or is named above.
  if (createdN + createFailedN !== gated.length) {
    console.error(`!! SHORTFALL: created ${createdN} + failed ${createFailedN} != ${gated.length} gated rows`);
    process.exitCode = 1;
  }
  if (createdN !== creates.length) {
    console.error(
      `!! SHORTFALL vs plan: planned ${creates.length} creates, wrote ${createdN} ` +
        `(live-gate blocked ${gateBlocked}, failed/dropped ${createFailedN}). Names are listed above.`,
    );
    process.exitCode = 1;
  }
  if (updateFailedN) process.exitCode = 1;
  console.log(`Lead total now: ${await db.lead.count()}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => base.$disconnect());
