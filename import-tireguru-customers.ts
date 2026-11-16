/**
 * TireGuru "Customer Master List" (reportID act=rep_cust_mast, split_names=1) →
 * CRM Customer roster sync. Keeps BRAIN's customer list in step with TireGuru:
 * customers that exist in TireGuru (last-12-months active) but not in BRAIN get
 * CREATED; existing customers are matched by business name and left untouched
 * (never overwrites rep/tier/notes/pricing). Report columns (split):
 *   Cust# | First Name | Last Name | Business Name
 *
 * Run from apps/rhino-brain (DRY RUN by default — shows what it would create):
 *   npx tsx ../../import-tireguru-customers.ts --file <master.xlsx> --location FL [--apply]
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

const norm = (s: string) => s.toLowerCase().replace(/\s*&\s*/g, "&").replace(/\s+/g, " ").trim();
const titleCase = (s: string) => s.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

type Row = { business: string; contact: string | null };

function parse(): Row[] {
  const wb = XLSX.readFile(FILE!);
  const sheet = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null }) as unknown[][];
  // locate the header row and the Business/First/Last columns
  let bi = -1, fi = -1, li = -1, headerRow = -1;
  for (let i = 0; i < sheet.length; i++) {
    const r = (sheet[i] || []).map(c => (typeof c === "string" ? c.trim().toLowerCase() : ""));
    const b = r.findIndex(c => c === "business name");
    if (b >= 0) { bi = b; fi = r.findIndex(c => c === "first name"); li = r.findIndex(c => c === "last name"); headerRow = i; break; }
  }
  if (bi < 0) { console.error("could not find a 'Business Name' column — was the report pulled with split_names=1?"); process.exit(1); }
  const seen = new Set<string>();
  const out: Row[] = [];
  for (let i = headerRow + 1; i < sheet.length; i++) {
    const r = sheet[i] || [];
    const business = typeof r[bi] === "string" ? (r[bi] as string).trim() : "";
    if (!business) continue;
    const key = norm(business);
    if (seen.has(key)) continue; // dedup within the file
    seen.add(key);
    const first = fi >= 0 && typeof r[fi] === "string" ? (r[fi] as string).trim() : "";
    const last = li >= 0 && typeof r[li] === "string" ? (r[li] as string).trim() : "";
    const contact = [first, last].filter(Boolean).join(" ").trim() || null;
    out.push({ business, contact: contact ? titleCase(contact) : null });
  }
  return out;
}

async function main() {
  const rows = parse();
  console.log(`[${LOC}] parsed ${rows.length} distinct customers from the master list`);

  const loc = await db.location.findFirst({ where: { shortTag: LOC } });
  if (!loc) { console.error(`location ${LOC} not found`); process.exit(1); }
  const existing = await db.customer.findMany({ where: { locationId: loc.id }, select: { companyName: true } });
  const have = new Set(existing.map(c => norm(c.companyName)));
  // also index a "stripped leading contact code" variant the way other importers do
  for (const c of existing) have.add(norm(c.companyName.replace(/^,\s*\S+\s+/, "")));

  const toCreate = rows.filter(r => !have.has(norm(r.business)));
  console.log(`[${LOC}] ${rows.length - toCreate.length} already in BRAIN, ${toCreate.length} NEW to create`);
  if (toCreate.length) { console.log("  sample new:"); toCreate.slice(0, 10).forEach(r => console.log(`   • ${r.business}${r.contact ? ` (${r.contact})` : ""}`)); }

  if (!APPLY) { console.log("DRY RUN — re-run with --apply to create these customers."); return; }

  const data = toCreate.map(r => ({
    companyName: r.business.slice(0, 160), contactPerson: r.contact?.slice(0, 120) ?? null,
    locationId: loc.id, status: "ACTIVE" as const, source: "EXISTING" as const,
    notes: "Synced from TireGuru customer master",
  }));
  let created = 0;
  for (let i = 0; i < data.length; i += 200) { const res = await db.customer.createMany({ data: data.slice(i, i + 200), skipDuplicates: true }); created += res.count; }
  console.log(`[${LOC}] created ${created} new customers.`);
}

main().finally(() => db.$disconnect());
