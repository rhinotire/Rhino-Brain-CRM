/**
 * TireGuru "Customer Transaction File" (reportID 83, rep_inv_transaction_file)
 * → CRM CustomerReorder mirror. Each row is one invoice line carrying the
 * customer, the date, the item/size and qty/sales; we roll it up per customer
 * into a purchase-cadence summary (first/last purchase, # of purchase days,
 * total sales, average interval) that powers the reorder / churn-risk alerts.
 *
 * Pulled per company by tools/tireguru-sync (locationIDs scoped to one company,
 * trailing window). Snapshot semantics: each import REPLACES the company's rows.
 *
 * Run from apps/rhino-brain:
 *   npx tsx ../../import-tireguru-reorder.ts --file <txn.xlsx> --location FL [--apply]
 *
 * Report anatomy (verified 2026-10-29): header row at "Mfg/Group/Item"; columns
 * [Mfg/Group/Item, Customer/Vendor, Zip, Date, Ref#, Qty, Cost, FET, Sales, Source].
 * Item section headers have col1 null; a DATA row has a customer in col1, an
 * MM/DD/YYYY date in col3 and Source="SALES"; "Item Subtotal"/"TOTALS" rows are
 * skipped. Returns (negative qty/sales) are kept so totalSales is net.
 */
import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";

const db = new PrismaClient();
const args = process.argv.slice(2);
const arg = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const APPLY = args.includes("--apply");
const FILE = arg("file");
const LOC = (arg("location") ?? "").toUpperCase();
if (!FILE || !["FL", "TX"].includes(LOC)) { console.error("--file <xlsx> --location FL|TX required"); process.exit(1); }
const COMPANY = LOC === "TX" ? "EVERFLOW" : "RHINO";

const num = (v: unknown): number => {
  if (typeof v === "number") return v;
  if (typeof v === "string") { const n = Number(v.replace(/[$,]/g, "")); return Number.isFinite(n) ? n : 0; }
  return 0;
};
const parseDate = (v: unknown): Date | null => {
  if (v instanceof Date) return v;
  if (typeof v !== "string") return null;
  const m = v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  return new Date(m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]), Number(m[1]) - 1, Number(m[2]));
};
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const norm = (s: string) => s.toLowerCase().replace(/\s*&\s*/g, "&").replace(/\s+/g, " ").trim();

type Agg = { name: string; days: Set<string>; first: Date; last: Date; total: number };

function parse(): Map<string, Agg> {
  const wb = XLSX.readFile(FILE!);
  const sheet = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null }) as unknown[][];
  const byCust = new Map<string, Agg>();
  for (const r of sheet) {
    const name = typeof r[1] === "string" ? r[1].trim() : "";
    const date = parseDate(r[3]);
    const source = typeof r[9] === "string" ? r[9].trim().toUpperCase() : "";
    // a real sales line: has a customer, a date, Source=SALES. Section headers
    // (col1 null) and "Item Subtotal"/"TOTALS" rows (no date) fall away.
    if (!name || !date || source !== "SALES") continue;
    if (/^(item subtotal|totals?)/i.test(name)) continue;
    const sale = num(r[8]);
    const key = norm(name);
    let a = byCust.get(key);
    if (!a) { a = { name, days: new Set(), first: date, last: date, total: 0 }; byCust.set(key, a); }
    a.days.add(dayKey(date));
    if (date < a.first) a.first = date;
    if (date > a.last) a.last = date;
    a.total += sale;
  }
  return byCust;
}

async function main() {
  const byCust = parse();
  const aggs = [...byCust.values()];
  const totalSales = aggs.reduce((s, a) => s + a.total, 0);
  console.log(`[${LOC}/${COMPANY}] parsed ${aggs.length} customers | net sales $${totalSales.toFixed(2)}`);
  if (aggs.length === 0) { console.log("no customer rows parsed — check the report format"); return; }
  if (!APPLY) {
    console.log("Dry run — re-run with --apply to write. Sample:");
    for (const a of aggs.slice(0, 6)) {
      const n = a.days.size;
      const avg = n >= 2 ? Math.round((a.last.getTime() - a.first.getTime()) / 86400000 / (n - 1)) : null;
      console.log(`  ${a.name}: ${n} buy-days, last ${a.last.toISOString().slice(0, 10)}, every ~${avg ?? "?"}d, $${a.total.toFixed(2)}`);
    }
    return;
  }

  const loc = await db.location.findFirst({ where: { shortTag: LOC } });
  if (!loc) { console.error(`location ${LOC} not found`); process.exit(1); }
  const customers = await db.customer.findMany({ where: { locationId: loc.id }, select: { id: true, companyName: true } });
  const byName = new Map(customers.map(c => [norm(c.companyName), c]));
  for (const c of customers) {
    const stripped = norm(c.companyName.replace(/^,\s*\S+\s+/, ""));
    if (stripped && !byName.has(stripped)) byName.set(stripped, c);
  }

  let matched = 0;
  const rows = aggs.map(a => {
    const n = a.days.size;
    const cust = byName.get(norm(a.name)) ?? null;
    if (cust) matched++;
    return {
      company: COMPANY,
      customerName: a.name.slice(0, 120),
      customerId: cust?.id ?? null,
      lastPurchaseAt: a.last,
      firstPurchaseAt: a.first,
      purchaseCount: n,
      totalSales: a.total,
      avgIntervalDays: n >= 2 ? Math.round((a.last.getTime() - a.first.getTime()) / 86400000 / (n - 1)) : null,
    };
  });

  await db.customerReorder.deleteMany({ where: { company: COMPANY } });
  for (let i = 0; i < rows.length; i += 500) await db.customerReorder.createMany({ data: rows.slice(i, i + 500) });
  console.log(`[${LOC}/${COMPANY}] replaced with ${rows.length} rows; matched to CRM customers: ${matched}/${rows.length}`);
}

main().finally(() => db.$disconnect());
