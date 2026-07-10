"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/auth";

export type ArRow = {
  customerName: string;
  amount: number;
  balance: number;
  dueDate: string; // ISO date
};

/**
 * A/R aging reports are snapshots — each upload REPLACES all open invoices.
 * Customers are matched by exact company name (case-insensitive); unmatched
 * rows still import and show under their raw name on the A/R page.
 */
export async function importArInvoices(fileName: string, rows: ArRow[]): Promise<{ ok?: boolean; imported?: number; matched?: number; error?: string }> {
  const session = await requireManager();
  if (rows.length === 0) return { error: "No valid rows found in the file." };
  if (rows.length > 5000) return { error: "Too many rows (max 5000) — is this the right file?" };

  const customers = await db.customer.findMany({ select: { id: true, companyName: true, locationId: true } });
  const byName = new Map(customers.map(c => [c.companyName.trim().toLowerCase(), c]));

  let matched = 0;
  const data = rows.map(r => {
    const cust = byName.get(r.customerName.trim().toLowerCase());
    if (cust) matched++;
    return {
      customerId: cust?.id ?? null,
      customerName: r.customerName.trim(),
      amount: r.amount,
      balance: r.balance,
      dueDate: new Date(r.dueDate),
      locationId: cust?.locationId ?? null,
      source: `CSV:${fileName}`.slice(0, 100),
    };
  });

  // snapshot semantics: replace everything
  await db.invoice.deleteMany();
  for (let i = 0; i < data.length; i += 500) {
    await db.invoice.createMany({ data: data.slice(i, i + 500) });
  }

  await db.importBatch.create({
    data: {
      entity: "AR_INVOICES",
      fileName,
      rowCount: rows.length,
      successful: rows.length,
      failed: 0,
      userId: session.userId,
    },
  });

  revalidatePath("/ar");
  revalidatePath("/settings/import");
  return { ok: true, imported: rows.length, matched };
}
