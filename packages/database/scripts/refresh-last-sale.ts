/**
 * Maintain `Customer.lastSaleAt` — the sale evidence that protects an account from returning to
 * the 公海 pool (spec 2026-10-26-customer-pool-design.md section 6.4).
 *
 * WHY INVOICES: most sales go through TireGuru at the counter and never reach the CRM as a logged
 * activity, so a rep whose customer buys weekly would lose that account on the 90-day rule. The
 * `/api/churn` feed carries a lastSale date but posts only the AT-RISK list, so using it alone would
 * protect exactly the wrong customers. `Invoice` (imported by the A/R sync) is the signal that
 * covers everyone who buys.
 *
 * `Invoice.dueDate` is the sale date plus payment terms rather than the sale date itself. That errs
 * toward protecting an account, which is the safe direction here.
 *
 * THIS FUNCTION OWNS `lastSaleAt` AND RECOMPUTES IT WHOLESALE. If another source ever starts
 * writing the field (the churn feed is the likely one), this must become a MAX of both sources
 * rather than a straight overwrite, or that source's value will be erased on the next A/R import.
 *
 *   npx tsx packages/database/scripts/refresh-last-sale.ts --dry
 *   npx tsx packages/database/scripts/refresh-last-sale.ts
 */
import { PrismaClient } from "@prisma/client";
// The SQL and the helper live in services so the A/R import can use the SAME statements without
// importing a module that pulls in @prisma/client, and so they are unit-tested.
import { refreshLastSale } from "../../services/src/last-sale";

async function main() {
  const dry = process.argv.includes("--dry");
  const db = new PrismaClient();
  try {
    const q = <T>(sql: string) => db.$queryRawUnsafe<T[]>(sql);
    const [inv] = await q<{ rows: bigint; linked: bigint; orphan: bigint }>(
      `SELECT COUNT(*)::bigint AS rows,
              COUNT(DISTINCT "customerId")::bigint AS linked,
              COUNT(*) FILTER (WHERE "customerId" IS NULL)::bigint AS orphan
         FROM "Invoice"`,
    );
    console.log(`Invoice rows: ${Number(inv.rows)}`);
    console.log(`  customers with at least one invoice: ${Number(inv.linked)}`);
    console.log(`  invoice rows with NO customer link : ${Number(inv.orphan)}  <- these protect nobody`);

    const [recent] = await q<{ n: bigint }>(
      `SELECT COUNT(DISTINCT "customerId")::bigint AS n FROM "Invoice"
        WHERE "customerId" IS NOT NULL AND "dueDate" > NOW() - INTERVAL '90 days'`,
    );
    console.log(`  of those, invoiced within 90 days  : ${Number(recent.n)}  <- protected from the pool`);

    const [pending] = await q<{ to_set: bigint; to_clear: bigint }>(
      `SELECT
         (SELECT COUNT(*)::bigint FROM "Customer" c
            JOIN (SELECT "customerId", MAX("dueDate") AS max_due FROM "Invoice"
                   WHERE "customerId" IS NOT NULL GROUP BY "customerId") s ON s."customerId" = c.id
           WHERE c."lastSaleAt" IS DISTINCT FROM s.max_due) AS to_set,
         (SELECT COUNT(*)::bigint FROM "Customer"
           WHERE "lastSaleAt" IS NOT NULL
             AND id NOT IN (SELECT "customerId" FROM "Invoice" WHERE "customerId" IS NOT NULL)) AS to_clear`,
    );
    console.log(`\nwould set lastSaleAt on   : ${Number(pending.to_set)} customer(s)`);
    console.log(`would clear lastSaleAt on : ${Number(pending.to_clear)} customer(s)`);

    if (dry) {
      console.log("\nDRY RUN — nothing written.");
      return;
    }

    const { set, cleared } = await refreshLastSale(db);
    console.log(`\nwrote: ${set} set, ${cleared} cleared.`);

    const [after] = await q<{ with_sale: bigint; with_invoice: bigint }>(
      `SELECT (SELECT COUNT(*)::bigint FROM "Customer" WHERE "lastSaleAt" IS NOT NULL) AS with_sale,
              (SELECT COUNT(DISTINCT "customerId")::bigint FROM "Invoice" WHERE "customerId" IS NOT NULL) AS with_invoice`,
    );
    const ok = Number(after.with_sale) === Number(after.with_invoice);
    console.log(`verify: customers with lastSaleAt = ${Number(after.with_sale)}, customers with an invoice = ${Number(after.with_invoice)} -> ${ok ? "MATCH" : "*** MISMATCH ***"}`);
    if (!ok) process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

// Only run the CLI when invoked directly, so importing refreshLastSale costs nothing.
if (process.argv[1] && process.argv[1].includes("refresh-last-sale")) {
  main().catch(e => {
    console.error(e);
    process.exitCode = 1;
  });
}
