/**
 * TireGuru "Customer Transaction File" (reportID 83) → CRM CustomerSizeHistory
 * mirror. Same xlsx the reorder/velocity importers read, aggregated per
 * (customer, tire size): which customers actually buy which sizes. Powers the
 * "new arrival / price drop" broadcast — pick a size, text the customers who
 * buy it. Snapshot-replaced per company.
 *
 * Run from apps/rhino-brain:
 *   npx tsx ../../import-tireguru-sizes.ts --file <txn.xlsx> --location FL [--apply]
 *
 * A DATA row (col1 = customer, col3 = date, col9 = "SALES") carries the item in
 * col0 as "<itemcode> <SIZE>"; the brand is the most recent "-BRAND-" section
 * header above it. Size headers/group headers (col1 null) and subtotal rows are
 * skipped. sizeKey = digits only (e.g. "235/80R16" -> "2358016").
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
const norm = (s: string) => s.toLowerCase().replace(/\s*&\s*/g, "&").replace(/\s+/g, " ").trim();

type Agg = { customerName: string; sizeKey: string; sizeDisplay: string; brand: string | null; units: number; last: Date };

function parse(): Map<string, Agg> {
  const wb = XLSX.readFile(FILE!);
  const sheet = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null }) as unknown[][];
  const out = new Map<string, Agg>();
  let brand: string | null = null;
  for (const r of sheet) {
    const c0 = typeof r[0] === "string" ? r[0].trim() : "";
    const cust = typeof r[1] === "string" ? r[1].trim() : "";
    // brand section header: "-CROSSWIND-" with no customer in col1
    if (c0 && !cust && /^-.+-$/.test(c0)) { brand = c0.replace(/^-|-$/g, "").trim() || null; continue; }
    const date = parseDate(r[3]);
    const source = typeof r[9] === "string" ? r[9].trim().toUpperCase() : "";
    if (!cust || !date || source !== "SALES") continue;
    if (/^(item subtotal|totals?)/i.test(cust)) continue;
    const m = c0.match(/^(\S+)\s+(.+)$/);
    if (!m || !/^\d/.test(m[1])) continue;
    const size = m[2].trim();
    const sizeKey = size.replace(/\D/g, "");
    if (sizeKey.length < 4) continue; // not a tire size (parts/labor/fees)
    const key = `${norm(cust)}|${sizeKey}`;
    let a = out.get(key);
    if (!a) { a = { customerName: cust, sizeKey, sizeDisplay: size, brand, units: 0, last: date }; out.set(key, a); }
    a.units += num(r[5]);
    if (date > a.last) { a.last = date; if (brand) a.brand = brand; }
  }
  return out;
}

async function main() {
  const aggs = [...parse().values()].filter(a => a.units > 0);
  console.log(`[${LOC}/${COMPANY}] parsed ${aggs.length} customer×size rows`);
  if (aggs.length === 0) { console.log("nothing parsed — check the report format"); return; }
  if (!APPLY) {
    console.log("Dry run — re-run with --apply. Sample:");
    for (const a of aggs.slice(0, 6)) console.log(`  ${a.customerName} · ${a.sizeDisplay} (${a.sizeKey}) ${a.brand ?? ""} — ${a.units}u, last ${a.last.toISOString().slice(0, 10)}`);
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
  const rows = aggs.map(a => ({
    company: COMPANY, customerName: a.customerName.slice(0, 120), customerId: byName.get(norm(a.customerName))?.id ?? null,
    sizeKey: a.sizeKey.slice(0, 20), sizeDisplay: a.sizeDisplay.slice(0, 40), brand: a.brand?.slice(0, 40) ?? null,
    units: a.units, lastBoughtAt: a.last,
  }));
  await db.customerSizeHistory.deleteMany({ where: { company: COMPANY } });
  for (let i = 0; i < rows.length; i += 500) await db.customerSizeHistory.createMany({ data: rows.slice(i, i + 500) });
  const matched = rows.filter(r => r.customerId).length;
  console.log(`[${LOC}/${COMPANY}] replaced with ${rows.length} rows; ${matched} matched to CRM customers`);
}

main().finally(() => db.$disconnect());
