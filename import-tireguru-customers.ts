/**
 * TireGuru "Customer Master List" (act=rep_cust_mast, split_names=1, with the
 * Address + Phone columns added via used[]=PHONE,ADDR) → CRM Customer roster
 * sync + phone/address enrichment. Report columns:
 *   Cust# | First Name | Last Name | Business Name | Address1 | Address2 |
 *   City | State | Zip | Business Phone | Home Phone | Cell Phone
 *
 * - Customers in TireGuru but not BRAIN → CREATED (with contact + phone + address).
 * - Existing customers that are MISSING a phone/address → ENRICHED (only empty
 *   fields are filled; rep, tier, notes, pricing and any phone already on file
 *   are never overwritten).
 *
 * Run from apps/rhino-brain (DRY RUN by default):
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
const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());
const phoneClean = (v: unknown): string | null => { const d = str(v).replace(/[^\d-]/g, "").trim(); return d.replace(/\D/g, "").length >= 7 ? str(v) : null; };

type Row = { business: string; contact: string | null; phone: string | null; cell: string | null; address: string | null; city: string | null; state: string | null; zip: string | null };

function parse(): Row[] {
  const wb = XLSX.readFile(FILE!);
  const sheet = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null }) as unknown[][];
  let hdr = -1; let col: Record<string, number> = {};
  for (let i = 0; i < sheet.length; i++) {
    const r = (sheet[i] || []).map(c => str(c).toLowerCase());
    if (r.includes("business name")) {
      hdr = i;
      const find = (name: string) => r.findIndex(c => c === name);
      col = {
        first: find("first name"), last: find("last name"), business: find("business name"),
        addr1: find("address1"), addr2: find("address2"), city: find("city"), state: find("state"), zip: find("zip"),
        bphone: find("business phone"), hphone: find("home phone"), cphone: find("cell phone"),
      };
      break;
    }
  }
  if (hdr < 0 || col.business < 0) { console.error("could not find 'Business Name' column (pull with split_names=1)"); process.exit(1); }
  const at = (r: unknown[], i: number) => (i >= 0 ? r[i] : null);
  const seen = new Set<string>();
  const out: Row[] = [];
  for (let i = hdr + 1; i < sheet.length; i++) {
    const r = sheet[i] || [];
    const business = str(at(r, col.business));
    if (!business) continue;
    const key = norm(business);
    if (seen.has(key)) continue;
    seen.add(key);
    const contact = [str(at(r, col.first)), str(at(r, col.last))].filter(Boolean).join(" ").trim();
    const bphone = phoneClean(at(r, col.bphone)) || phoneClean(at(r, col.hphone));
    const cell = phoneClean(at(r, col.cphone));
    const addr1 = str(at(r, col.addr1));
    out.push({
      business, contact: contact ? titleCase(contact) : null,
      phone: bphone || cell, cell,
      address: addr1 || null, city: str(at(r, col.city)) || null,
      state: str(at(r, col.state)).toUpperCase().slice(0, 2) || null,
      zip: str(at(r, col.zip)).split(/\s/)[0] || null,
    });
  }
  return out;
}

async function main() {
  const rows = parse();
  console.log(`[${LOC}] parsed ${rows.length} distinct customers`);
  const loc = await db.location.findFirst({ where: { shortTag: LOC } });
  if (!loc) { console.error(`location ${LOC} not found`); process.exit(1); }
  const existing = await db.customer.findMany({
    where: { locationId: loc.id },
    select: { id: true, companyName: true, phone: true, contactCell: true, address: true, city: true, state: true, zip: true, contactPerson: true },
  });
  const byName = new Map<string, (typeof existing)[number]>();
  for (const c of existing) {
    byName.set(norm(c.companyName), c);
    const stripped = norm(c.companyName.replace(/^,\s*\S+\s+/, ""));
    if (stripped && !byName.has(stripped)) byName.set(stripped, c);
  }

  const toCreate = rows.filter(r => !byName.has(norm(r.business)));
  // existing customers we can fill gaps on (only when the row has a value and the record is empty)
  const toEnrich: { id: string; data: Record<string, string> }[] = [];
  for (const r of rows) {
    const c = byName.get(norm(r.business));
    if (!c) continue;
    const data: Record<string, string> = {};
    if (!c.phone && r.phone) data.phone = r.phone;
    if (!c.contactCell && r.cell) data.contactCell = r.cell;
    if (!c.address && r.address) data.address = r.address;
    if (!c.city && r.city) data.city = r.city;
    if (!c.state && r.state) data.state = r.state;
    if (!c.zip && r.zip) data.zip = r.zip;
    if (!c.contactPerson && r.contact) data.contactPerson = r.contact;
    if (Object.keys(data).length) toEnrich.push({ id: c.id, data });
  }
  const withPhone = toCreate.filter(r => r.phone).length;
  console.log(`[${LOC}] NEW: ${toCreate.length} (${withPhone} with phone) | ENRICH existing: ${toEnrich.length} (fill empty phone/address)`);

  if (!APPLY) {
    console.log("DRY RUN — re-run with --apply. Sample new:");
    toCreate.slice(0, 6).forEach(r => console.log(`   • ${r.business} · ${r.contact ?? "—"} · ${r.phone ?? "no phone"} · ${[r.city, r.state].filter(Boolean).join(", ")}`));
    return;
  }

  const data = toCreate.map(r => ({
    companyName: r.business.slice(0, 160), contactPerson: r.contact?.slice(0, 120) ?? null,
    phone: r.phone?.slice(0, 40) ?? null, contactCell: r.cell?.slice(0, 40) ?? null,
    address: r.address?.slice(0, 200) ?? null, city: r.city?.slice(0, 80) ?? null, state: r.state ?? null, zip: r.zip?.slice(0, 20) ?? null,
    locationId: loc.id, status: "ACTIVE" as const, source: "EXISTING" as const, notes: "Synced from TireGuru customer master",
  }));
  let created = 0;
  for (let i = 0; i < data.length; i += 200) { const res = await db.customer.createMany({ data: data.slice(i, i + 200), skipDuplicates: true }); created += res.count; }

  let enriched = 0;
  for (let i = 0; i < toEnrich.length; i += 25) {
    await Promise.all(toEnrich.slice(i, i + 25).map(u => db.customer.update({ where: { id: u.id }, data: u.data }).then(() => { enriched++; }).catch(() => {})));
  }
  console.log(`[${LOC}] created ${created} new, enriched ${enriched} existing with phone/address.`);
}

main().finally(() => db.$disconnect());
