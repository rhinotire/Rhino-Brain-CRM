/**
 * TireGuru "Salesperson Sales Analysis" (month-to-date, invoice detail) → CRM
 * PosSale mirror. Pulled per company by tools/tireguru-sync every 2h; feeds
 * the owner's daily brief and real-revenue rep dashboards.
 *
 * Run from apps/rhino-brain:
 *   npx tsx ../../import-tireguru-sales.ts --file <sales.xlsx> --location FL [--apply]
 *
 * Report anatomy (verified 2026-10-20): header row at "SALESPERSON/TECHNICIAN";
 * a section's first invoice shares the row with the salesperson name
 * ["Garcia, Cesar (0001)", 312259, "10/01/2026", qty, parts, labor, sale, gp$, gp%],
 * continuation rows have col0 null; "TOTALS …" / "GRAND TOTALS" rows are skipped.
 * Snapshot semantics: the report is month-to-date, so each import REPLACES the
 * location's rows for the months the report covers.
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

type Row = { salesperson: string; invoiceNo: string; date: Date; qty: number; sale: number; gp: number };

function parse(): Row[] {
  const wb = XLSX.readFile(FILE!);
  const sheet = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null }) as unknown[][];
  const out: Row[] = [];
  let salesperson = "";
  for (const r of sheet) {
    const c0 = typeof r[0] === "string" ? r[0].trim() : null;
    if (c0) {
      if (/^(TOTALS|GRAND TOTALS)/i.test(c0) || c0.startsWith("SALESPERSON")) continue;
      // section header: strip the "(0001)" code; may carry the first invoice
      salesperson = c0.replace(/\s*\(\d+\)\s*$/, "").trim();
    }
    if (!salesperson) continue;
    const date = parseDate(r[2]);
    if (r[1] === null || !date) continue;
    out.push({
      salesperson,
      invoiceNo: String(r[1]).replace(/\*/g, "").trim().slice(0, 40),
      date,
      qty: Math.round(num(r[3])),
      sale: num(r[6]),
      gp: num(r[7]),
    });
  }
  return out;
}

async function main() {
  const rows = parse();
  const totalSale = rows.reduce((s, r) => s + r.sale, 0);
  const totalGp = rows.reduce((s, r) => s + r.gp, 0);
  const months = [...new Set(rows.map(r => `${r.date.getFullYear()}-${r.date.getMonth()}`))];
  console.log(`[${LOC}] parsed ${rows.length} invoice lines | sale $${totalSale.toFixed(2)} | GP $${totalGp.toFixed(2)} | months: ${months.join(", ")}`);
  if (!APPLY) { console.log("Dry run — re-run with --apply."); return; }

  const loc = await db.location.findFirst({ where: { shortTag: LOC } });
  if (!loc) throw new Error(`location ${LOC} not found`);

  // snapshot replace per covered month
  for (const mkey of months) {
    const [y, m] = mkey.split("-").map(Number);
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 1);
    await db.posSale.deleteMany({ where: { locationId: loc.id, date: { gte: start, lt: end } } });
  }
  const data = rows.map(r => ({ locationId: loc.id, salesperson: r.salesperson, invoiceNo: r.invoiceNo, date: r.date, qty: r.qty, sale: r.sale, gp: r.gp }));
  for (let i = 0; i < data.length; i += 500) await db.posSale.createMany({ data: data.slice(i, i + 500) });
  console.log(`[${LOC}] replaced with ${data.length} rows.`);
}

main().finally(() => db.$disconnect());
