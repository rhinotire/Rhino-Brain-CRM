/**
 * TireGuru "Customer Transaction File" (reportID 83) → CRM ProductVelocity
 * mirror. Same xlsx the reorder importer reads, aggregated per SKU instead of
 * per customer: net units sold + first/last sold over the window. Joined to
 * Product.sku + the company's InventorySnapshot to drive restock suggestions
 * (fast movers running low; dead stock sitting unsold).
 *
 * Run from apps/rhino-brain:
 *   npx tsx ../../import-tireguru-velocity.ts --file <txn.xlsx> --location FL [--apply]
 *
 * A DATA row (col1 = customer, col3 = MM/DD/YYYY date, col9 = "SALES") carries
 * the item in col0 as "<itemcode> <SIZE>" — itemcode = Product.sku. Item/group
 * section headers (col1 null) and "Item Subtotal"/"TOTALS" rows are skipped.
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

type Agg = { sku: string; size: string | null; units: number; first: Date; last: Date };

function parse(): Map<string, Agg> {
  const wb = XLSX.readFile(FILE!);
  const sheet = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null }) as unknown[][];
  const bySku = new Map<string, Agg>();
  for (const r of sheet) {
    const cust = typeof r[1] === "string" ? r[1].trim() : "";
    const date = parseDate(r[3]);
    const source = typeof r[9] === "string" ? r[9].trim().toUpperCase() : "";
    if (!cust || !date || source !== "SALES") continue; // only real sales lines
    const item = typeof r[0] === "string" ? r[0].trim() : "";
    const m = item.match(/^(\S+)\s+(.+)$/);
    const sku = (m ? m[1] : item).trim();
    if (!/^\d/.test(sku)) continue; // guard against stray header text
    const size = m ? m[2].trim() : null;
    const qty = num(r[5]);
    let a = bySku.get(sku);
    if (!a) { a = { sku, size, units: 0, first: date, last: date }; bySku.set(sku, a); }
    a.units += qty;
    if (date < a.first) a.first = date;
    if (date > a.last) a.last = date;
    if (!a.size && size) a.size = size;
  }
  return bySku;
}

async function main() {
  const aggs = [...parse().values()];
  const totalUnits = aggs.reduce((s, a) => s + a.units, 0);
  console.log(`[${LOC}/${COMPANY}] parsed ${aggs.length} SKUs | net units ${totalUnits}`);
  if (aggs.length === 0) { console.log("no sales lines parsed — check the report format"); return; }
  if (!APPLY) {
    console.log("Dry run — re-run with --apply to write. Top sellers:");
    for (const a of [...aggs].sort((x, y) => y.units - x.units).slice(0, 6)) {
      console.log(`  ${a.sku} ${a.size ?? ""}: ${a.units} units, last ${a.last.toISOString().slice(0, 10)}`);
    }
    return;
  }
  const rows = aggs.map(a => ({
    company: COMPANY, sku: a.sku.slice(0, 60), size: a.size?.slice(0, 60) ?? null,
    description: null as string | null, unitsSold: a.units, firstSoldAt: a.first, lastSoldAt: a.last,
  }));
  await db.productVelocity.deleteMany({ where: { company: COMPANY } });
  for (let i = 0; i < rows.length; i += 500) await db.productVelocity.createMany({ data: rows.slice(i, i + 500) });
  console.log(`[${LOC}/${COMPANY}] replaced with ${rows.length} SKU rows.`);
}

main().finally(() => db.$disconnect());
