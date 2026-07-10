"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/auth";

export type OrderRow = {
  invoice: string;      // external invoice #
  customerName: string;
  date: string;         // ISO
  total: number;
};

const norm = (s: string) => s.toLowerCase().replace(/\s*&\s*/g, "&").replace(/\s+/g, " ").trim();

/**
 * Import Tire Guru sales/invoice history. Orders are keyed by invoice # so
 * re-uploading overlapping date ranges updates rather than duplicates.
 * Matched to customers by company name; unmatched invoices are skipped + reported.
 */
export async function importOrders(fileName: string, rows: OrderRow[]): Promise<{ ok?: boolean; imported?: number; matched?: number; unmatched?: number; unmatchedSample?: string[]; error?: string }> {
  const session = await requireManager();
  if (rows.length === 0) return { error: "No order rows found in the file." };
  if (rows.length > 50000) return { error: "Too many rows (max 50000)." };

  const customers = await db.customer.findMany({ select: { id: true, companyName: true, locationId: true } });
  const byName = new Map(customers.map(c => [norm(c.companyName), c]));
  for (const c of customers) {
    const stripped = norm(c.companyName.replace(/^,\s*\S+\s+/, ""));
    if (stripped && !byName.has(stripped)) byName.set(stripped, c);
  }
  const defaultLoc = (await db.location.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } }))?.id;
  if (!defaultLoc) return { error: "No location configured." };

  let matched = 0;
  const unmatched = new Set<string>();
  let imported = 0;

  // process in chunks; upsert by externalId (invoice #)
  for (const r of rows) {
    const cust = byName.get(norm(r.customerName));
    if (!cust) { unmatched.add(r.customerName.trim()); continue; }
    matched++;
    const date = new Date(r.date);
    if (isNaN(date.getTime())) continue;
    const externalId = r.invoice.trim() || `${cust.id}-${r.date}-${r.total}`;
    await db.order.upsert({
      where: { externalId },
      create: { externalId, customerId: cust.id, locationId: cust.locationId ?? defaultLoc, orderDate: date, total: r.total, source: `IMPORT:${fileName}`.slice(0, 100) },
      update: { customerId: cust.id, orderDate: date, total: r.total },
    });
    imported++;
  }

  await db.importBatch.create({
    data: { entity: "ORDERS", fileName, rowCount: rows.length, successful: imported, failed: unmatched.size, userId: session.userId },
  });

  revalidatePath("/dashboard");
  revalidatePath("/settings/import");
  return { ok: true, imported, matched, unmatched: unmatched.size, unmatchedSample: [...unmatched].slice(0, 8) };
}
