// One-off: seed the first carrier (TMS) per spec §8. Run:
//   cd packages/database && npx tsx scripts/seed-freight-carrier.ts
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const existing = await db.freightCarrier.findFirst({ where: { name: "TMS Transportation" } });
  if (existing) {
    console.log("TMS already seeded:", existing.id);
    return;
  }
  const carrier = await db.freightCarrier.create({
    data: {
      name: "TMS Transportation",
      equipmentTypes: ["DRY_VAN_53", "FLATBED_53"],
      contacts: {
        create: [
          { name: "Dayleen Marine", email: "dayleen.marine@tms-transportation.com" },
          { name: "Tim Sebacher", email: "tim.sebacher@tms-transportation.com" },
        ],
      },
    },
  });
  console.log("Seeded TMS:", carrier.id);
}

main().finally(() => db.$disconnect());
