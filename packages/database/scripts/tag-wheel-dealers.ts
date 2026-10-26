/**
 * Tag the customers that provably carry the scraped wheel brands.
 *
 * Source of truth: the cross-sell tasks the dealer-list importer created
 * ("Cross-sell wheels: ..."). Each one links a Customer that matched a dealer
 * on the brand locators, so the customer demonstrably stocks those wheels.
 *
 * Non-destructive on purpose (owner decision 2026-10-26): `Customer.type` holds
 * ONE value, and 35 of these are TIRE_SHOP — retyping them to WHEEL_SHOP would
 * lose the tire-shop label. A tag is multi-valued, and the customers list's
 * search box already matches tag names.
 *
 *   --dry   report only, write nothing (default is to write)
 */
import { PrismaClient } from "@prisma/client";

const TAG_NAME = "WHEEL DEALER";
const TAG_COLOR = "#7c3aed"; // violet — distinct from the slate default
const TASK_PREFIX = "Cross-sell wheels:";

const db = new PrismaClient();

async function main() {
  const dry = process.argv.includes("--dry");

  const tasks = await db.task.findMany({
    where: { title: { startsWith: TASK_PREFIX } },
    select: { customerId: true },
  });
  const customerIds = [...new Set(tasks.map(t => t.customerId).filter((id): id is string => id !== null))];

  if (customerIds.length === 0) {
    console.log("No cross-sell tasks found — nothing to tag.");
    return;
  }

  const customers = await db.customer.findMany({
    where: { id: { in: customerIds } },
    select: { id: true, companyName: true, type: true, state: true },
    orderBy: { companyName: "asc" },
  });
  console.log(`${customers.length} customer(s) carry the scraped wheel brands:\n`);
  for (const c of customers) {
    console.log(`  ${c.companyName} (${c.state ?? "?"}) — currently ${c.type}`);
  }

  if (dry) {
    console.log(`\nDRY RUN: would ensure tag "${TAG_NAME}" and link ${customers.length} customer(s). Nothing written.`);
    return;
  }

  const tag = await db.tag.upsert({
    where: { name: TAG_NAME },
    update: {},
    create: { name: TAG_NAME, color: TAG_COLOR },
  });

  const result = await db.customerTag.createMany({
    data: customers.map(c => ({ customerId: c.id, tagId: tag.id })),
    skipDuplicates: true, // re-runnable: already-tagged customers are left alone
  });

  const linked = await db.customerTag.count({ where: { tagId: tag.id } });
  console.log(`\nTag "${TAG_NAME}" (${tag.id}): ${result.count} new link(s) written, ${linked} customer(s) tagged in total.`);
  if (linked !== customers.length) {
    console.log(`NOTE: ${linked} tagged but ${customers.length} expected — the tag also covers customers tagged elsewhere.`);
  }
  console.log(`Find them in the CRM: /customers and search "${TAG_NAME}".`);
}

main()
  .catch(e => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
