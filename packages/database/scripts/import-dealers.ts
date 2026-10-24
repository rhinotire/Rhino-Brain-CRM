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
 *                 Canada to Qingdao)
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
    select: { id: true, companyName: true, phone: true, city: true, dedupeKey: true, meta: true, assignedRepId: true, email: true, state: true, locationId: true },
  });
  const leadIdx = buildLeadIndex(leadRows);
  const leadById = new Map(leadRows.map((l) => [l.id, l]));
  const customers = await db.customer.findMany({ select: { phone: true, website: true } });
  const custPhones = new Set(customers.map((c) => phoneKey(c.phone)).filter(Boolean));
  const custDomains = new Set(customers.map((c) => domainKey(c.website)).filter(Boolean));

  const locByTag = async (tag: string) => (await db.location.findFirst({ where: { shortTag: tag }, select: { id: true } }))?.id ?? null;
  const ids = { rhino: await locByTag("FL"), everflow: await locByTag("TX"), qingdao: await locByTag("QD") };
  const needs = territoryArg === "rhino" ? ["rhino"] : territoryArg === "everflow" ? ["everflow"] : ["rhino", "everflow", "qingdao"];
  for (const n of needs) {
    if (!ids[n as keyof typeof ids]) {
      console.error(`Location for "${n}" not found (shortTag FL / TX / QD). Refusing to route dealers to a null location.`);
      process.exit(1);
    }
  }
  const admin = arg("user")
    ? await db.user.findFirst({ where: { email: arg("user") }, select: { id: true, email: true } })
    : await db.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" }, select: { id: true, email: true } });
  if (!admin) {
    console.error("No user found to own the ImportBatch (pass --user <email>).");
    process.exit(1);
  }
  console.log(
    `Snapshot: ${exclusionRows.length} ExclusionList rows (${blacklistRows.length} BLACKLIST), ${leadRows.length} Leads, ${customers.length} Customers; ` +
      `locations FL=${ids.rhino ? "ok" : "MISSING"} TX=${ids.everflow ? "ok" : "MISSING"} QD=${ids.qingdao ? "ok" : "MISSING"}; batch owner=${admin.email}`,
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
    bump(byLoc, plan.locationId === ids.rhino ? "Rhino (FL)" : plan.locationId === ids.everflow ? "Everflow (TX)" : plan.locationId === ids.qingdao ? "Qingdao (QD)" : "null (no rep)");
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
  console.log(out.join("\n"));

  if (DRY) {
    console.log("\nDRY RUN complete: zero writes (write operations are blocked on this client).");
    return;
  }

  // ---- REAL WRITE ---------------------------------------------------------------------
  // The DB-backed gates run again on exactly the rows about to be created, so a blacklist
  // or exclusion row the in-memory snapshot somehow missed still stops the write.
  const gated: typeof creates = [];
  let gateBlocked = 0;
  await pool(creates, 8, async (c) => {
    const cand = { companyName: c.p.d.name, website: c.p.d.website, phone: c.p.d.phone };
    const bl = await findBlacklistMatch(cand);
    const ex = bl ? null : await isExcluded(cand);
    if (bl || ex) gateBlocked++;
    else gated.push(c);
  });
  console.log(`Live gate re-check: ${gated.length} clear, ${gateBlocked} blocked by findBlacklistMatch/isExcluded`);

  if (gated.length === 0 && updates.length === 0) {
    console.log("Nothing to write (re-run against an already-imported list). No ImportBatch created.");
    return;
  }

  const batch = await db.importBatch.create({
    data: { entity: "leads", fileName: batchFile, rowCount: examined.length, successful: 0, failed: 0, userId: admin.id },
  });
  let createdN = 0;
  let failedN = 0;
  const failures: string[] = [];

  const toData = (c: (typeof gated)[number]): Prisma.LeadCreateManyInput => {
    const n = buildNewLead(c.p.d, c.p.plan);
    if (!n.dedupeKey) throw new Error(`refusing empty dedupeKey for ${c.p.d.name}`);
    return { ...n, meta: n.meta as Prisma.InputJsonValue, importBatchId: batch.id };
  };
  for (let i = 0; i < gated.length; i += 200) {
    const chunk = gated.slice(i, i + 200);
    try {
      const r = await db.lead.createMany({ data: chunk.map(toData), skipDuplicates: true });
      createdN += r.count;
    } catch (e) {
      for (const c of chunk) {
        try {
          await db.lead.create({ data: toData(c) });
          createdN++;
        } catch (e2) {
          failedN++;
          failures.push(`${c.p.d.name}: ${e2 instanceof Error ? e2.message.split("\n").pop() : e2}`);
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
      failedN++;
      failures.push(`${u.p.d.name}: ${e instanceof Error ? e.message.split("\n").pop() : e}`);
    }
  }

  await db.importBatch.update({
    where: { id: batch.id },
    data: { successful: createdN + updatedN, failed: failedN },
  });
  console.log(`\nImportBatch ${batch.id}: created ${createdN}, updated ${updatedN}, failed ${failedN}, skipped by live gate ${gateBlocked}`);
  for (const f of failures.slice(0, 20)) console.log(`  FAILED ${f}`);
  console.log(`Lead total now: ${await db.lead.count()}`);
  if (failedN) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => base.$disconnect());
