/**
 * TireGuru "Customer Aged Trial Balance" (multi-location, DETAILED) → CRM
 * Invoice snapshot. Pulled automatically by tools/tireguru-sync; replaces each
 * company's A/R the same way the manual uploader does (actions/ar-import.ts):
 * snapshot semantics, per-location hard scoping, name+phone customer matching.
 *
 * Run from apps/rhino-brain:
 *   npx tsx ../../import-tireguru-aging.ts --file <aged_trial.xlsx> [--apply]
 *
 * Report anatomy (verified 2026-10-17):
 *   - customer section header: "<NAME>      SalesPerson: ..." in col 0
 *   - "  Business: 555-...; Cell: 555-..." line → phone matching fallback
 *   - invoice rows: [null, loc, ref#, invDate, dueDate, Future, Current, 31-60, 61-90, 91-120, 120+]
 *   - "-PMT" rows (no due date) + a row with "BALANCE" in the due-date column
 *     net a group of rows → the group collapses to one net row
 *   - "CUST BALNCE" row ends the section
 * TireGuru location codes: 1 = Rhino FL, 05 = Everflow TX. Other entities
 * (Buffalo 2 / Cheap2Go 03 / Ideal 04) are skipped — not CRM companies.
 */
import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";

const db = new PrismaClient();
const args = process.argv.slice(2);
const arg = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const APPLY = args.includes("--apply");
const FILE = arg("file");
if (!FILE) { console.error("--file <aged_trial.xlsx> required"); process.exit(1); }

const LOC_TAG: Record<string, "FL" | "TX"> = { "1": "FL", "5": "TX" };
const norm = (s: string) => s.toLowerCase().replace(/\s*&\s*/g, "&").replace(/\s+/g, " ").trim();
const last10 = (p: string) => p.replace(/\D/g, "").slice(-10);

type Row = { customerName: string; phones: string[]; locTag: "FL" | "TX"; invoiceNo: string; dueDate: Date; balance: number };

function parseDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (typeof v !== "string") return null;
  const m = v.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return new Date(year, Number(m[1]) - 1, Number(m[2]));
}

function parse(): { rows: Row[]; skippedOtherLoc: number } {
  const wb = XLSX.readFile(FILE!);
  const sheet = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null }) as unknown[][];
  const out: Row[] = [];
  let skippedOtherLoc = 0;
  let customerName = "";
  let phones: string[] = [];
  // group buffer: rows that may be collapsed by a following "BALANCE" line
  let group: Row[] = [];
  const flush = () => { out.push(...group); group = []; };

  for (const r of sheet) {
    const c0 = typeof r[0] === "string" ? r[0] : null;
    if (c0 && c0.includes("SalesPerson:")) {
      flush();
      customerName = c0.split("SalesPerson:")[0].trim();
      phones = [];
      continue;
    }
    if (c0?.trim().startsWith("Business:") || c0?.trim().startsWith("Cell:")) {
      phones.push(...c0.split(/[;]/).map(s => s.replace(/^[^:]*:/, "").trim()).filter(Boolean));
      continue;
    }
    if (c0 && c0.toUpperCase().includes("CUST BALNCE")) { flush(); continue; }
    if (c0 && c0.toUpperCase().includes("TOTAL BALANCE")) { flush(); break; }

    const due = r[4];
    const buckets = r.slice(5, 11).map(v => (typeof v === "number" ? v : 0));
    const balance = Math.round(buckets.reduce((s, v) => s + v, 0) * 100) / 100;

    // "BALANCE" marker: the group nets out to this value → replace the group
    if (typeof due === "string" && due.trim().toUpperCase() === "BALANCE") {
      const first = group.find(g => g.invoiceNo && g.invoiceNo !== "-PMT") ?? group[0];
      if (first) {
        out.push({ ...first, balance });
        group = [];
      }
      continue;
    }

    if (!customerName || r[1] === null || r[2] === null) { continue; }
    const locKey = String(r[1]).replace(/^0+/, "");
    const locTag = LOC_TAG[locKey];
    if (!locTag) { skippedOtherLoc++; continue; }
    if (balance === 0) continue;
    const dueDate = parseDate(r[4]) ?? parseDate(r[3]);
    if (!dueDate) continue;
    group.push({ customerName, phones: [...phones], locTag, invoiceNo: String(r[2]).trim(), dueDate, balance });
  }
  flush();
  return { rows: out, skippedOtherLoc };
}

async function main() {
  const { rows, skippedOtherLoc } = parse();
  const byTag: Record<"FL" | "TX", Row[]> = { FL: [], TX: [] };
  for (const r of rows) byTag[r.locTag].push(r);
  console.log(`Parsed ${rows.length} open items (FL ${byTag.FL.length} / TX ${byTag.TX.length}); skipped ${skippedOtherLoc} rows of other entities`);
  const total = rows.reduce((s, r) => s + r.balance, 0);
  console.log(`Net balance parsed: $${total.toFixed(2)}`);
  if (!APPLY) { console.log("Dry run — re-run with --apply to write."); return; }

  for (const tag of ["FL", "TX"] as const) {
    const loc = await db.location.findFirst({ where: { shortTag: tag } });
    if (!loc) { console.log(`! location ${tag} not found — skipped`); continue; }
    const list = byTag[tag];

    const customers = await db.customer.findMany({
      where: { locationId: loc.id },
      select: { id: true, companyName: true, phone: true, contactCell: true },
    });
    const byName = new Map(customers.map(c => [norm(c.companyName), c]));
    for (const c of customers) {
      const stripped = norm(c.companyName.replace(/^,\s*\S+\s+/, ""));
      if (stripped && !byName.has(stripped)) byName.set(stripped, c);
    }
    const byPhone = new Map<string, (typeof customers)[number]>();
    for (const c of customers) {
      for (const p of [c.phone, c.contactCell]) {
        const d = last10(p ?? "");
        if (d.length === 10 && !byPhone.has(d)) byPhone.set(d, c);
      }
    }

    let matched = 0;
    const seen = new Set<string>();
    const data = list.map(r => {
      let cust = byName.get(norm(r.customerName)) ?? null;
      if (!cust) for (const p of r.phones) { const hit = byPhone.get(last10(p)); if (hit) { cust = hit; break; } }
      if (cust && !seen.has(r.customerName)) { matched++; seen.add(r.customerName); }
      return {
        customerId: cust?.id ?? null,
        customerName: r.customerName,
        amount: r.balance,
        balance: r.balance,
        dueDate: r.dueDate,
        invoiceNo: r.invoiceNo.slice(0, 40),
        locationId: loc.id,
        source: "TIREGURU_SYNC",
      };
    });

    await db.invoice.deleteMany({ where: { OR: [{ locationId: loc.id }, { locationId: null }] } });
    for (let i = 0; i < data.length; i += 500) await db.invoice.createMany({ data: data.slice(i, i + 500) });
    console.log(`[${tag}] replaced with ${data.length} rows; customers matched: ${matched}/${seen.size + (new Set(list.map(x => x.customerName)).size - seen.size)}`);
  }

  // ImportBatch requires a user — attribute the automated sync to an admin.
  const admin = await db.user.findFirst({ where: { role: "ADMIN", active: true }, orderBy: { createdAt: "asc" } });
  if (admin) {
    await db.importBatch.create({
      data: { entity: "AR_INVOICES", fileName: `tireguru-sync:${FILE!.split(/[\\/]/).pop()}`, rowCount: rows.length, successful: rows.length, failed: 0, userId: admin.id },
    }).catch(() => {});
  }
  console.log("Done.");
}

main().finally(() => db.$disconnect());
