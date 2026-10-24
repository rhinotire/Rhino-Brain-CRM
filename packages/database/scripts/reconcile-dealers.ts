// packages/database/scripts/reconcile-dealers.ts
/**
 * Dealer-list reconciliation report (Phase 0). Answers "how many of these
 * dealers are genuinely new?" before anything is imported or any AI budget
 * is spent.
 *
 * STRICTLY READ-ONLY against whatever DATABASE_URL points at (production).
 * Only findMany / count are used — no create/update/upsert/delete,
 * no $executeRaw, no transactions. Safe to run repeatedly.
 *
 *   cd packages/database
 *   npx tsx scripts/reconcile-dealers.ts --file <workbook.xlsx> [--out report.csv] [--crosscheck N]
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

async function main() {
  const file = arg("file");
  if (!file) {
    console.error("usage: tsx scripts/reconcile-dealers.ts --file <workbook.xlsx> [--out report.csv] [--crosscheck N]");
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
