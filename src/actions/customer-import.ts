"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import type { CustomerType } from "@prisma/client";

export type MasterRow = {
  custNo: string; name: string; address?: string; city?: string; state?: string; zip?: string;
  phone?: string; cell?: string; email?: string; terms?: string; credit?: string;
  salesperson?: string; group?: string;
};

const norm = (s: string) => s.toLowerCase().replace(/\s*&\s*/g, "&").replace(/[^\w\s/]/g, "").replace(/\s+/g, " ").trim();
const last10 = (s: string) => s.replace(/\D/g, "").slice(-10);
const money = (v: string) => { const n = Number(String(v).replace(/[$,\s]/g, "")); return isNaN(n) ? null : n; };
const title = (s: string) => s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).trim();

const GROUP_TYPE: Record<string, CustomerType> = {
  "car dealers": "CAR_DEALER", "tire shop": "TIRE_SHOP", "road service": "FLEET",
  "truck repair shop": "REPAIR_SHOP", "tire wholesale": "WHOLESALE_DEALER",
  "trailer factories": "TRAILER_MANUFACTURER", "otr & industrial": "OTHER",
};

function splitName(raw: string): { contact: string | null; company: string } {
  const m = raw.match(/^\s*([A-Za-z'.\- ]{0,25}),\s+([A-Za-z'.\-]+)\s+(.+)$/);
  if (m && !/\d/.test(m[1])) return { contact: title(`${m[2]} ${m[1]}`.replace(/\s+/g, " ")) || null, company: m[3].trim() };
  return { contact: null, company: raw.replace(/^\s*,\s*/, "").trim() };
}

/** Upsert customers from a Tire Guru Customer Master List. Matches by Cust# → phone → company name. */
export async function importCustomerMaster(fileName: string, rows: MasterRow[], locationId?: string): Promise<{ ok?: boolean; updated?: number; created?: number; error?: string }> {
  const session = await requireManager();
  if (rows.length === 0) return { error: "No customer rows found." };
  if (rows.length > 20000) return { error: "Too many rows (max 20000)." };
  const loc = locationId ? await db.location.findUnique({ where: { id: locationId }, select: { id: true } }) : null;

  const users = await db.user.findMany({ select: { id: true, name: true } });
  const userByName = new Map(users.map(u => [norm(u.name), u.id]));

  const existing = await db.customer.findMany({ select: { id: true, companyName: true, phone: true, contactCell: true, tireguruId: true } });
  const byPhone = new Map<string, string>();
  for (const c of existing) for (const p of [c.phone, c.contactCell]) { const d = last10(p ?? ""); if (d.length === 10 && !byPhone.has(d)) byPhone.set(d, c.id); }
  const byTgid = new Map(existing.filter(c => c.tireguruId).map(c => [c.tireguruId!, c.id]));
  const byName = new Map<string, string>();
  for (const c of existing) { const k = norm(c.companyName); if (k && !byName.has(k)) byName.set(k, c.id); }

  let updated = 0, created = 0;
  const usedTgid = new Set<string>();

  for (const r of rows) {
    const { contact, company } = splitName(r.name.trim());
    if (!company) continue;
    const repId = r.salesperson ? userByName.get(norm(r.salesperson)) ?? null : null;
    const type = r.group ? GROUP_TYPE[r.group.trim().toLowerCase()] ?? null : null;
    const emailRaw = (r.email ?? "").trim().replace(/^www\./i, "");
    const email = /@/.test(emailRaw) ? emailRaw : null;

    const data = {
      companyName: company,
      contactPerson: contact ?? undefined,
      phone: r.phone?.trim() || undefined,
      contactCell: r.cell?.trim() || undefined,
      email: email ?? undefined,
      address: r.address?.trim() || undefined,
      city: r.city?.trim() || undefined,
      state: r.state?.trim() || undefined,
      zip: r.zip?.trim() || undefined,
      paymentTerms: r.terms?.trim() || undefined,
      creditLimit: money(r.credit ?? "") ?? undefined,
      ...(type ? { type } : {}),
      ...(repId ? { assignedRepId: repId } : {}),
      ...(loc ? { locationId: loc.id } : {}),
      ...(r.custNo?.trim() ? { tireguruId: r.custNo.trim() } : {}),
    };

    let id = (r.custNo && byTgid.get(r.custNo.trim())) || (r.phone && byPhone.get(last10(r.phone))) || byName.get(norm(company)) || null;
    const cn = r.custNo?.trim();
    if (cn && usedTgid.has(cn)) delete (data as { tireguruId?: string }).tireguruId; else if (cn) usedTgid.add(cn);

    if (id) { await db.customer.update({ where: { id }, data }).catch(() => {}); updated++; }
    else { await db.customer.create({ data: { ...data, status: "ACTIVE", source: "EXISTING", externalSource: "TIREGURU_MASTER" } }).catch(() => {}); created++; }
  }

  await db.importBatch.create({ data: { entity: "CUSTOMERS", fileName, rowCount: rows.length, successful: updated + created, failed: 0, userId: session.userId } });
  revalidatePath("/customers");
  revalidatePath("/settings/import");
  return { ok: true, updated, created };
}
