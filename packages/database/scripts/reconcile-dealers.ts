// packages/database/scripts/reconcile-dealers.ts
/**
 * Dealer-list reconciliation report (Phase 0). Answers "how many of these
 * dealers are genuinely new?" before anything is imported or any AI budget
 * is spent.
 *
 * STRICTLY READ-ONLY against whatever DATABASE_URL points at (production).
 * Only findMany / count / groupBy are used — no create/update/upsert/delete,
 * no $executeRaw, no transactions, and no SourceRun row for the report's own
 * run. Safe to run repeatedly.
 *
 *   cd packages/database
 *   npx tsx scripts/reconcile-dealers.ts --file <workbook.xlsx> [--out report.csv] [--crosscheck N]
 *   npx tsx scripts/reconcile-dealers.ts --batch <importBatchId[,id2...]>
 *
 * Two modes (passing both is an error):
 *   --file   Phase 0 pre-import reconciliation, described below.
 *   --batch  Phase 4 post-import conversion report: per tier, leads created /
 *            contacted / quoted / converted / converted $ for the given
 *            ImportBatch(es), so "was this scrape worth it?" has an answer
 *            before the next brand is scraped. Comma-separate several ids
 *            (same parsing as enrich-dealers.ts) when an import was split, e.g.
 *            a smoke-test batch plus the main one. The counting rules live in
 *            packages/services/src/dealer-batch-report.ts.
 *
 * Buckets, in precedence order (every record lands in exactly one):
 *   BLACKLISTED      ExclusionList kind=BLACKLIST match   (never reaches a human)
 *   ALREADY_CUSTOMER ExclusionList kind=EXISTING_CUSTOMER match
 *   ALREADY_LEAD     dedupeKey already on a Lead row
 *   NON_DEDUPABLE    dedupeKey === ""
 *   NEW              everything else  <- the deliverable
 *
 * Matching: ExclusionList is read once and matched with the project's own
 * matchesExclusion() - the exact function isExcluded()/findBlacklistMatch()
 * wrap - instead of ~10k per-record round trips. --crosscheck N proves the
 * two paths agree on N sampled records by calling the real gates.
 *
 * Territory comes from the STATE field only; the Country column is corrupt.
 */
import { PrismaClient } from "@prisma/client";
import { existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseDealerWorkbook, type DealerRecord } from "../../services/src/dealer-list-parse";
import { tierFor } from "../../services/src/dealer-tier";
import { matchesExclusion, isExcluded, findBlacklistMatch } from "../../services/src/exclusion-service";
import { CONTACT_ACTIVITY_TYPES, importBatchLeadCountCheck, rollupBatch, type Counts } from "../../services/src/dealer-batch-report";
import { assignStateLocation } from "../../services/src/prospect-score";
import { countryFromState } from "../../services/src/geo-state";
import { domainKey, nameKey, phoneKey } from "../../services/src/referral-matching";

const db = new PrismaClient();

const BUCKETS = ["BLACKLISTED", "ALREADY_CUSTOMER", "ALREADY_LEAD", "NON_DEDUPABLE", "NEW"] as const;
type Bucket = (typeof BUCKETS)[number];
const TERRITORIES = ["Rhino states", "Everflow states", "Other US", "Canada", "Unresolved"] as const;
type Territory = (typeof TERRITORIES)[number];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith("--")) {
    console.error(`--${name} requires a value`);
    process.exit(2);
  }
  return v;
}

function territoryOf(state: string): Territory {
  const s = state.trim().toUpperCase();
  const loc = assignStateLocation(s);
  if (loc === "RHINO") return "Rhino states";
  if (loc === "EVERFLOW") return "Everflow states";
  const c = countryFromState(s);
  if (c === "US") return "Other US";
  if (c === "CA") return "Canada";
  return "Unresolved";
}

const csvCell = (v: unknown): string => {
  let s = String(v ?? "");
  // Neutralise spreadsheet formula injection (=, +, -, @, tab, CR lead chars).
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const pad = (s: string | number, n: number) => String(s).padEnd(n);
const num = (s: string | number, n: number) => String(s).padStart(n);
const zeroRow = () => Object.fromEntries(TERRITORIES.map((t) => [t, 0])) as Record<Territory, number>;

const usd = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (r: number | null) => (r === null ? "n/a" : (r * 100).toFixed(1) + "%");

/**
 * --batch mode. Read-only. Every number is counted against the leads actually
 * read for the given batch id(s), and the report cross-checks that count against
 * independent queries so a silently-empty or silently-partial result cannot pass
 * for a real one.
 */
async function batchReport(): Promise<void> {
  // Same parsing as enrich-dealers.ts: split on commas, trim, drop empties.
  const batchIds = (arg("batch") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (batchIds.length === 0) {
    console.error("--batch <importBatchId[,id2...]> requires at least one id");
    process.exit(2);
  }

  const batches = await db.importBatch.findMany({
    where: { id: { in: batchIds } },
    select: { id: true, fileName: true, rowCount: true, successful: true, createdAt: true },
  });
  const missing = batchIds.filter((id) => !batches.some((b) => b.id === id));
  if (missing.length > 0) {
    console.error(`Unknown ImportBatch id(s): ${missing.join(", ")}. Nothing was reported (a typo must not look like an empty batch).`);
    process.exit(2);
  }

  const inBatch = { importBatchId: { in: batchIds } };
  const leads = await db.lead.findMany({
    where: inBatch,
    select: {
      id: true, meta: true, stage: true, convertedCustomerId: true, convertedAt: true, assignedRepId: true, locationId: true,
      convertedCustomer: { select: { createdAt: true } },
    },
  });
  // Independent counts, to reconcile the rollup against.
  const perBatch = await db.lead.groupBy({ by: ["importBatchId"], where: inBatch, _count: { _all: true } });
  const countedPerBatch = new Map(perBatch.map((g) => [g.importBatchId, g._count._all]));
  const convertedCount = await db.lead.count({ where: { ...inBatch, convertedCustomerId: { not: null } } });

  const activityRows = await db.activity.findMany({ where: { lead: inBatch }, select: { leadId: true, type: true } });
  const activities = activityRows.flatMap((a) => (a.leadId ? [{ leadId: a.leadId, type: a.type as string }] : []));
  // Raw database counts for the same batch, taken with their own queries (not from `activities`),
  // so a broken or mis-filtered activity read cannot pass for a true zero.
  const contactTypes = [...CONTACT_ACTIVITY_TYPES];
  const rawContactActivities = await db.activity.count({ where: { lead: inBatch, type: { in: contactTypes } } });
  const rawContactLeads = (await db.activity.groupBy({ by: ["leadId"], where: { lead: inBatch, type: { in: contactTypes } } })).length;
  const rawQuoteActivities = await db.activity.count({ where: { lead: inBatch, type: "QUOTE" } });
  const rawQuoteLeads = (await db.activity.groupBy({ by: ["leadId"], where: { lead: inBatch, type: "QUOTE" } })).length;
  const rawActivitiesAnyType = await db.activity.count({ where: { lead: inBatch } });

  // Quote and Order hang off Customer, so they are only looked up for converted customers.
  const customerIds = [...new Set(leads.flatMap((l) => (l.convertedCustomerId ? [l.convertedCustomerId] : [])))];
  const quotes = customerIds.length
    ? (await db.quote.findMany({ where: { customerId: { in: customerIds } }, select: { customerId: true, createdAt: true, status: true } }))
        .map((q) => ({ customerId: q.customerId, createdAt: q.createdAt, status: q.status as string }))
    : [];
  const orders = customerIds.length
    ? (await db.order.findMany({ where: { customerId: { in: customerIds } }, select: { customerId: true, orderDate: true, total: true } }))
        .map((o) => ({ customerId: o.customerId, orderDate: o.orderDate, total: o.total.toNumber() }))
    : [];

  const r = rollupBatch({
    leads: leads.map(({ convertedCustomer, ...l }) => ({ ...l, stage: l.stage as string, customerCreatedAt: convertedCustomer?.createdAt ?? null })),
    activities, quotes, orders,
  });
  const T = r.total;

  const out: string[] = [];
  const P = (s = "") => out.push(s);
  P("");
  P("=== DEALER-LIST BATCH REPORT (read-only) ===");
  for (const b of batches) {
    P(`batch ${b.id}  ${b.fileName}  imported ${b.createdAt.toISOString().slice(0, 10)}  ` +
      `${num(countedPerBatch.get(b.id) ?? 0, 6)} leads (ImportBatch row: rowCount ${b.rowCount}, created ${b.successful}; leads updated in place keep their original batch and are not counted)`);
  }
  P(`*** LEADS IN SCOPE: ${T.leads.toLocaleString("en-US")} across ${batches.length} batch${batches.length === 1 ? "" : "es"}. This is the denominator for every number below. ***`);
  P("");

  // Say plainly which kind of zero this is.
  if (T.leads === 0) {
    P("STATUS: NO DATA. The batch id(s) exist but hold 0 leads, so there is nothing to measure.");
  } else if (T.contacted === 0 && T.quoted === 0 && T.converted === 0) {
    P(`STATUS: NOT YET WORKED. 0 of ${T.leads} leads have been contacted, quoted or converted. These zeros are real: they were counted`);
    P(`        against ${T.leads} leads that exist in the database, and a separate database count finds ${rawActivitiesAnyType} activities of any type logged on them.`);
    P(`        ${T.claimed} lead(s) claimed by a rep; ${T.parked} parked with no location`);
    P("        (no rep can ever see those). Conversion rates cannot be judged until leads have been worked.");
  } else {
    P(`STATUS: IN PROGRESS. ${T.contacted} of ${T.leads} leads contacted (${pct(T.contacted / T.leads)}), ${T.quoted} quoted, ${T.converted} converted.`);
    P(`        ${T.claimed} claimed by a rep; ${T.parked} parked with no location. Compare tiers on "Conv/contacted", not on raw counts: tiers are released at different times.`);
  }
  P("");

  P("=== BY TIER ===");
  P("Lower number = released to reps earlier. T1 is existing customers (not prospects); T2 is the best prospect tier; T8 is parked.");
  const row = (label: string, c: Counts) =>
    pad(label, 54) + num(c.leads, 7) + num(c.parked, 8) + num(c.contacted, 11) + num(c.quoted, 8) + num(c.converted, 11) + num(usd(c.convertedValue), 16) + num(pct(c.convertedPerContacted), 16);
  P(pad("Tier", 54) + num("Leads", 7) + num("Parked", 8) + num("Contacted", 11) + num("Quoted", 8) + num("Converted", 11) + num("Converted $", 16) + num("Conv/contacted", 16));
  for (const t of r.tiers) P(row(t.tier === null ? `--  ${t.label}` : `T${t.tier}  ${t.label}`, t));
  P(row("ALL TIERS", T));
  P('"Conv/contacted" = converted / contacted. n/a means nobody was contacted yet; it is not 0%.');
  P("Converted counts LEADS; Converted $ is deduped per CUSTOMER, so two leads merged into one customer show Converted 2 against one customer's dollars.");
  P(
    `Converted $ holds back order dollars from customers that predate the conversion (merged into an existing customer, or creation time unknown): ` +
      `${T.convertedUnverified} of ${T.converted} converted lead(s), ${usd(T.convertedValueUnverified)} not counted as won.`,
  );
  P("");

  P("=== HOW EACH COLUMN IS COUNTED ===");
  P("Leads       Lead rows with importBatchId in the batch id(s) above.");
  P("Parked      subset of Leads with no locationId (Canada / non-home state): no rep can see them, so they cannot be worked or converted.");
  P("Contacted   an Activity logged on the lead of type CALL/EMAIL/TEXT/WHATSAPP/QUOTE/ORDER/PAYMENT/VISIT/COMPLAINT (NO_ANSWER, VOICEMAIL, notes do not count),");
  P("            or Lead.stage moved on from NEW_LEAD (not LOST), or the lead is quoted/converted.");
  P("Quoted      a QUOTE activity on the lead, or stage QUOTED/NEGOTIATING, or a non-draft Quote on its converted customer made after conversion.");
  P("Converted   Lead.convertedCustomerId is set (a stage of FIRST_ORDER/ACTIVE_CUSTOMER alone does not count).");
  P("Converted $ Order.total for the converted customer, orders dated on/after Lead.convertedAt, only for customers created by the conversion (TireGuru-synced, so it lags). No Task source: Task links to Customer, not Lead.");
  P("");

  P("=== RECONCILIATION ===");
  const sumCounted = [...countedPerBatch.values()].reduce((a, b) => a + b, 0);
  const checks: [string, boolean][] = [
    [`lead rows read (${leads.length}) = Lead count grouped by batch (${sumCounted})`, leads.length === sumCounted],
    [`rollup leads (${T.leads}) = lead rows read (${leads.length})`, T.leads === leads.length],
    [`tier rows sum to ${r.tiers.reduce((s, t) => s + t.leads, 0)} = rollup leads (${T.leads})`, r.tiers.reduce((s, t) => s + t.leads, 0) === T.leads],
    [`rollup converted (${T.converted}) = independent count of convertedCustomerId not null (${convertedCount})`, T.converted === convertedCount],
    // The importer's own record of how many leads it created, a source independent of every query above.
    ...batches.map((b): [string, boolean] => {
      const { label, ok } = importBatchLeadCountCheck(b, countedPerBatch.get(b.id) ?? 0);
      return [label, ok];
    }),
    // Contacted/quoted may exceed these (stage evidence also counts) but must never fall short of them.
    [`contacted (${T.contacted}) >= leads with a contact-type activity per separate database count (${rawContactLeads})`, T.contacted >= rawContactLeads],
    [`quoted (${T.quoted}) >= leads with a QUOTE activity per separate database count (${rawQuoteLeads})`, T.quoted >= rawQuoteLeads],
  ];
  for (const [label, ok] of checks) P(`${ok ? "OK      " : "MISMATCH"}  ${label}`);
  P(
    `Activity cross-check (separate database counts for these leads): ${rawActivitiesAnyType} activities of any type; ` +
      `${rawContactActivities} contact-type activities on ${rawContactLeads} lead(s); ${rawQuoteActivities} QUOTE activities on ${rawQuoteLeads} lead(s).`,
  );
  P(`Data-quality: ${r.stageWonNotConverted} lead(s) at FIRST_ORDER/ACTIVE_CUSTOMER with no customer link (not counted as converted); ${r.convertedWithoutDate} converted with no convertedAt (no value dated).`);
  console.log(out.join("\n"));

  if (T.leads === 0 || checks.some(([, ok]) => !ok)) {
    if (T.leads !== 0) console.error("RECONCILIATION MISMATCH: the rollup does not agree with an independent count (see MISMATCH line above)");
    process.exitCode = 1;
  }
}

async function main() {
  const batchMode = process.argv.includes("--batch");
  if (batchMode && process.argv.includes("--file")) {
    console.error("--batch and --file are different modes; pass one");
    process.exit(2);
  }
  if (batchMode) return batchReport();
  const file = arg("file");
  if (!file) {
    console.error("usage: tsx scripts/reconcile-dealers.ts --file <workbook.xlsx> [--out report.csv] [--crosscheck N]");
    console.error("       tsx scripts/reconcile-dealers.ts --batch <importBatchId[,id2...]>");
    process.exit(2);
  }
  // Default output goes to the OS temp dir, never into the repo. The output
  // path never overwrites an existing file unless --force is passed.
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const outPath = resolve(arg("out") ?? join(tmpdir(), `dealer-reconcile-${stamp}.csv`));
  if (existsSync(outPath) && !process.argv.includes("--force")) {
    console.error(`Refusing to overwrite existing file: ${outPath} (pass --force to replace it)`);
    process.exit(2);
  }
  const crosscheck = Number(arg("crosscheck") ?? 0);
  if (!Number.isInteger(crosscheck) || crosscheck < 0) {
    console.error("--crosscheck must be a non-negative integer");
    process.exit(2);
  }

  const records: DealerRecord[] = await parseDealerWorkbook(file);
  console.log(`Parsed ${records.length} unique dealer records from ${file}`);

  // ---- read-only DB snapshot ------------------------------------------------
  const exclusionRows = await db.exclusionList.findMany({
    select: { kind: true, companyName: true, domain: true, phone: true },
  });
  const blacklistRows = exclusionRows.filter((r) => r.kind === "BLACKLIST");
  const customerRows = exclusionRows.filter((r) => r.kind === "EXISTING_CUSTOMER");
  const otherKindRows = exclusionRows.filter((r) => r.kind !== "BLACKLIST" && r.kind !== "EXISTING_CUSTOMER");

  // Leads: Lead has no website column (it lives in meta.website and, for
  // prospecting leads, in the "d:<domain>" dedupeKey). Dealers are matched on
  // domain, phone, or name+city, the way matchesExclusion matches, plus the
  // exact dedupeKey.
  const leadRows = await db.lead.findMany({
    select: { companyName: true, phone: true, city: true, dedupeKey: true, meta: true },
  });
  const leadKeys = new Set<string>();
  const leadDomains = new Set<string>();
  const leadPhones = new Set<string>();
  const leadNameCity = new Set<string>();
  for (const l of leadRows) {
    if (l.dedupeKey) {
      leadKeys.add(l.dedupeKey);
      if (l.dedupeKey.startsWith("d:")) leadDomains.add(l.dedupeKey.slice(2));
    }
    const metaWebsite =
      l.meta && typeof l.meta === "object" && !Array.isArray(l.meta) ? (l.meta as Record<string, unknown>).website : null;
    const dk = domainKey(typeof metaWebsite === "string" ? metaWebsite : null);
    if (dk) leadDomains.add(dk);
    const pk = phoneKey(l.phone);
    if (pk) leadPhones.add(pk);
    const nk = nameKey(l.companyName);
    const city = (l.city ?? "").trim().toLowerCase();
    if (nk.length >= 4 && city) leadNameCity.add(`${nk}:${city}`);
  }
  const leadMatchReasons: Record<string, number> = {};
  function leadMatch(d: DealerRecord): string | null {
    if (d.dedupeKey !== "" && leadKeys.has(d.dedupeKey)) return "dedupeKey";
    const dk = domainKey(d.website);
    if (dk && leadDomains.has(dk)) return "domain";
    const pk = phoneKey(d.phone);
    if (pk && leadPhones.has(pk)) return "phone";
    const nk = nameKey(d.name);
    if (nk.length >= 4) {
      const cities = new Set([d.city, ...d.locations.map((x) => x.city)].map((c) => c.trim().toLowerCase()).filter(Boolean));
      for (const c of cities) if (leadNameCity.has(`${nk}:${c}`)) return "name+city";
    }
    return null;
  }

  const reps = await db.user.findMany({
    where: { role: "SALES_REP", active: true },
    select: { name: true, location: { select: { name: true, shortTag: true } } },
  });

  const customerCount = await db.customer.count();
  const leadCount = await db.lead.count();
  // Informational only: Customer rows the exclusion list might not cover.
  const customers = await db.customer.findMany({ select: { phone: true, website: true } });
  const custPhones = new Set(customers.map((c) => phoneKey(c.phone)).filter(Boolean));
  const custDomains = new Set(customers.map((c) => domainKey(c.website)).filter(Boolean));

  console.log(
    `DB snapshot: ${exclusionRows.length} ExclusionList rows ` +
      `(${blacklistRows.length} BLACKLIST, ${customerRows.length} EXISTING_CUSTOMER, ${otherKindRows.length} other), ` +
      `${leadKeys.size} Lead dedupeKeys (of ${leadCount} leads; ${leadDomains.size} domains, ${leadPhones.size} phones), ${customerCount} Customers`,
  );

  // ---- classify -------------------------------------------------------------
  type Row = { d: DealerRecord; bucket: Bucket; tier: number; territory: Territory; flag: string };
  const rows: Row[] = [];
  const otherKindHitsInNew: Record<string, number> = {};
  let newMatchingCustomerTable = 0;
  const newMatchingCustomerNames: string[] = [];
  const newKeys = new Map<string, number>();

  for (const d of records) {
    const cand = { companyName: d.name, website: d.website, phone: d.phone };
    let bucket: Bucket;
    let leadReason: string | null = null;
    if (matchesExclusion(cand, blacklistRows)) bucket = "BLACKLISTED";
    else if (matchesExclusion(cand, customerRows)) bucket = "ALREADY_CUSTOMER";
    else if ((leadReason = leadMatch(d)) !== null) {
      bucket = "ALREADY_LEAD";
      leadMatchReasons[leadReason] = (leadMatchReasons[leadReason] ?? 0) + 1;
    } else if (d.dedupeKey === "") bucket = "NON_DEDUPABLE";
    else bucket = "NEW";

    // tier column: blacklisted -> 9, customers -> 1 (per tier spec); the NEW
    // breakdown always uses plain tierFor(d).
    const tier = bucket === "BLACKLISTED" ? 9 : bucket === "ALREADY_CUSTOMER" ? 1 : tierFor(d);
    const row: Row = { d, bucket, tier, territory: territoryOf(d.state), flag: "" };
    rows.push(row);

    if (bucket === "NEW") {
      newKeys.set(d.dedupeKey, (newKeys.get(d.dedupeKey) ?? 0) + 1);
      const flags: string[] = [];
      const hit = matchesExclusion(cand, otherKindRows);
      if (hit) {
        otherKindHitsInNew[hit.kind] = (otherKindHitsInNew[hit.kind] ?? 0) + 1;
        flags.push(`EXCLUSION_${hit.kind}`);
      }
      const pk = phoneKey(d.phone);
      const dk = domainKey(d.website);
      if ((pk && custPhones.has(pk)) || (dk && custDomains.has(dk))) {
        newMatchingCustomerTable++;
        newMatchingCustomerNames.push(`${d.name} (${d.city}, ${d.state})`);
        flags.push("CUSTOMER_TABLE_MATCH");
      }
      row.flag = flags.join("; ");
    }
  }

  // ---- optional gate cross-check (calls the real DB-backed gates) ----------
  let crosscheckLine = "";
  if (crosscheck > 0) {
    const step = Math.max(1, Math.floor(records.length / crosscheck));
    let checked = 0;
    let mismatches = 0;
    for (let i = 0; i < records.length && checked < crosscheck; i += step) {
      const d = records[i];
      const cand = { companyName: d.name, website: d.website, phone: d.phone };
      const realBl = !!(await findBlacklistMatch(cand));
      const mineBl = !!matchesExclusion(cand, blacklistRows);
      const realEx = !!(await isExcluded(cand));
      const mineEx = !!matchesExclusion(cand, exclusionRows);
      checked++;
      if (realBl !== mineBl || realEx !== mineEx) {
        mismatches++;
        console.error(`CROSSCHECK MISMATCH: ${d.name}`);
      }
    }
    crosscheckLine = `Gate cross-check: ${checked} records through findBlacklistMatch()/isExcluded() vs in-memory matcher -> ${mismatches} mismatches`;
  }

  // ---- aggregate ------------------------------------------------------------
  const byBucket: Record<Bucket, number> = { BLACKLISTED: 0, ALREADY_CUSTOMER: 0, ALREADY_LEAD: 0, NON_DEDUPABLE: 0, NEW: 0 };
  const grid = {} as Record<Bucket, Record<Territory, number>>;
  for (const b of BUCKETS) grid[b] = zeroRow();
  const netCust = zeroRow();
  const netOther = zeroRow();
  const netAll = zeroRow();
  const newGross = zeroRow();
  const newByTier: Record<number, number> = {};
  const newByTierTerritory: Record<number, Record<Territory, number>> = {};
  for (const r of rows) {
    byBucket[r.bucket]++;
    grid[r.bucket][r.territory]++;
    if (r.bucket === "NEW") {
      newGross[r.territory]++;
      if (!r.flag.includes("CUSTOMER_TABLE_MATCH")) netCust[r.territory]++;
      if (!r.flag.includes("EXCLUSION_")) netOther[r.territory]++;
      if (r.flag === "") netAll[r.territory]++;
      newByTier[r.tier] = (newByTier[r.tier] ?? 0) + 1;
      newByTierTerritory[r.tier] ??= zeroRow();
      newByTierTerritory[r.tier][r.territory]++;
    }
  }
  const total = BUCKETS.reduce((s, b) => s + byBucket[b], 0);

  const repsByLoc = new Map<string, number>();
  for (const r of reps) {
    const k = r.location ? `${r.location.name} (${r.location.shortTag})` : "(no location)";
    repsByLoc.set(k, (repsByLoc.get(k) ?? 0) + 1);
  }

  // ---- stdout ---------------------------------------------------------------
  const sumT = (g: Record<Territory, number>) => TERRITORIES.reduce((a, t) => a + g[t], 0);
  const fmt = (n: number) => n.toLocaleString("en-US");
  const headline =
    `NEW ${fmt(byBucket.NEW)} gross · ${fmt(sumT(netCust))} net of known customer matches · ` +
    `${fmt(sumT(netOther))} net of other exclusion kinds · ${fmt(sumT(netAll))} net of both`;
  const out: string[] = [];
  const P = (s = "") => out.push(s);
  let gridMismatch = false;
  P("");
  P("*** " + headline + " ***");
  P("");
  P("=== COUNTS BY BUCKET ===");
  for (const b of BUCKETS) P(`${pad(b, 18)}${num(byBucket[b], 7)}   ${((byBucket[b] / records.length) * 100).toFixed(1)}%`);
  P(`${pad("TOTAL", 18)}${num(total, 7)}   (parsed records: ${records.length}) ${total === records.length ? "-> SUMS EXACTLY" : "-> MISMATCH!"}`);
  P("");
  P("=== BUCKET x TERRITORY (state-derived) ===");
  P(pad("", 18) + TERRITORIES.map((t) => num(t, 17)).join("") + num("Total", 8));
  let gridGrand = 0;
  for (const b of BUCKETS) {
    const rowSum = sumT(grid[b]); // summed from the printed cells, not byBucket
    gridGrand += rowSum;
    const bad = rowSum !== byBucket[b];
    if (bad) gridMismatch = true;
    P(pad(b, 18) + TERRITORIES.map((t) => num(grid[b][t], 17)).join("") + num(rowSum, 8) + (bad ? "  MISMATCH vs bucket count!" : ""));
  }
  if (gridGrand !== records.length) gridMismatch = true;
  P(`GRID TOTAL ${gridGrand}${gridGrand === records.length ? " (= parsed records)" : "  MISMATCH vs parsed records!"}`);
  P("");
  P("=== NEW BY TERRITORY: GROSS vs NET ===");
  P(pad("", 26) + TERRITORIES.map((t) => num(t, 17)).join("") + num("Total", 8));
  for (const [label, g] of [
    ["NEW gross", newGross],
    ["net of customer matches", netCust],
    ["net of other exclusions", netOther],
    ["net of both", netAll],
  ] as const) {
    P(pad(label, 26) + TERRITORIES.map((t) => num(g[t], 17)).join("") + num(sumT(g), 8));
  }
  P("");
  P("=== NEW BY TIER ===");
  for (const t of Object.keys(newByTier).map(Number).sort((a, b) => a - b)) {
    P(`Tier ${t}: ${num(newByTier[t], 6)}   ` + TERRITORIES.map((x) => `${x}=${newByTierTerritory[t][x]}`).join("  "));
  }
  P(`NEW total: ${byBucket.NEW} (tier rows above are gross)`);
  P("");
  P("=== ACTIVE SALES_REP HEAD-COUNT BY LOCATION ===");
  for (const [k, v] of [...repsByLoc.entries()].sort()) P(`${pad(k, 36)}${num(v, 4)}`);
  P(`${pad("TOTAL active SALES_REP", 36)}${num(reps.length, 4)}`);
  P("");
  P("=== NOTES (informational; do not change the buckets above) ===");
  const dupNew = [...newKeys.values()].filter((n) => n > 1).length;
  P(`NEW records sharing a dedupeKey with another NEW record: ${dupNew} keys`);
  const otherTotal = Object.values(otherKindHitsInNew).reduce((a, b) => a + b, 0);
  P(
    `NEW records matching a non-BLACKLIST/non-CUSTOMER ExclusionList row (isExcluded() would block them at import): ${otherTotal}` +
      (otherTotal ? "  " + JSON.stringify(otherKindHitsInNew) : ""),
  );
  P(`NEW records matching a Customer-table phone/domain NOT caught by the ExclusionList: ${newMatchingCustomerTable}`);
  for (const n of newMatchingCustomerNames) P(`    - ${n}`);
  P(`ALREADY_LEAD match reasons (first matching test wins): ${JSON.stringify(leadMatchReasons)}`);
  P("*** " + headline + " ***");
  if (crosscheckLine) P(crosscheckLine);
  P(`DB state read: Lead=${leadCount}, Customer=${customerCount}`);
  console.log(out.join("\n"));

  // ---- CSV ------------------------------------------------------------------
  const header = ["name", "city", "state", "territory", "brands", "brand_count", "tier", "bucket", "net_flag"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [r.d.name, r.d.city, r.d.state, r.territory, r.d.brands.join("; "), r.d.brands.length, r.tier, r.bucket, r.flag]
        .map(csvCell)
        .join(","),
    );
  }
  writeFileSync(outPath, lines.join("\r\n") + "\r\n", "utf8");
  console.log(`\nPer-record CSV written: ${outPath} (${rows.length} rows)`);

  if (total !== records.length || gridMismatch) {
    console.error("RECONCILIATION MISMATCH: bucket/grid totals do not equal the parsed record count");
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
