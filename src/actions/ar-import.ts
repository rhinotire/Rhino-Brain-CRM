"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/auth";

export type ArRow = {
  customerName: string;
  amount: number;
  balance: number;   // negative = customer credit / prepayment
  dueDate: string;   // ISO date
  phones?: string[]; // any phone numbers from the report, used as a matching fallback
};

const norm = (s: string) => s.toLowerCase().replace(/\s*&\s*/g, "&").replace(/\s+/g, " ").trim();
const last10 = (p: string) => p.replace(/\D/g, "").slice(-10);

/**
 * A/R aging reports are snapshots — each upload REPLACES all invoices.
 * Customers matched by company name (case/spacing tolerant) with a
 * phone-number fallback; unmatched rows still import under the raw name.
 */
export async function importArInvoices(fileName: string, rows: ArRow[]): Promise<{ ok?: boolean; imported?: number; matched?: number; error?: string }> {
  const session = await requireManager();
  if (rows.length === 0) return { error: "No valid rows found in the file." };
  if (rows.length > 8000) return { error: "Too many rows (max 8000) — is this the right file?" };

  const customers = await db.customer.findMany({ select: { id: true, companyName: true, locationId: true, phone: true, contactCell: true } });
  const byName = new Map(customers.map(c => [norm(c.companyName), c]));
  for (const c of customers) {
    // some CRM names carry a ", FirstName " prefix from the original import
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
  const seenNames = new Set<string>();
  const data = rows.map(r => {
    let cust = byName.get(norm(r.customerName)) ?? null;
    if (!cust) {
      for (const p of r.phones ?? []) {
        const hit = byPhone.get(last10(p));
        if (hit) { cust = hit; break; }
      }
    }
    if (cust && !seenNames.has(r.customerName)) { matched++; seenNames.add(r.customerName); }
    return {
      customerId: cust?.id ?? null,
      customerName: r.customerName.trim(),
      amount: r.amount,
      balance: r.balance,
      dueDate: new Date(r.dueDate),
      locationId: cust?.locationId ?? null,
      source: `UPLOAD:${fileName}`.slice(0, 100),
    };
  });

  // snapshot semantics: replace everything
  await db.invoice.deleteMany();
  for (let i = 0; i < data.length; i += 500) {
    await db.invoice.createMany({ data: data.slice(i, i + 500) });
  }

  await db.importBatch.create({
    data: { entity: "AR_INVOICES", fileName, rowCount: rows.length, successful: rows.length, failed: 0, userId: session.userId },
  });

  revalidatePath("/ar");
  revalidatePath("/settings/import");
  return { ok: true, imported: rows.length, matched };
}
