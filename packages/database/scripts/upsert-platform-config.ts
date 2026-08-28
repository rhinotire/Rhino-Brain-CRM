/**
 * Idempotent platform config: BrandConfig rows + the IDEAL TIRES & WHEELS
 * installer (owner decisions 2026-07-11, docs/decision-log.md).
 * Run: pnpm exec tsx scripts/upsert-platform-config.ts   (uses DATABASE_URL)
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const IDEAL = {
  storeName: "IDEAL TIRES & WHEELS",
  address: "11423 Satellite Blvd",
  city: "Orlando",
  state: "FL",
  zip: "32837",
  phone: "+13216820973",
  serviceRadiusMi: 35,
  notifyEmail: "orlandotire@rhinotiresusa.com", // front desk notifications (Zoho)
  hoursJson: { mon: "8:00-17:30", tue: "8:00-17:30", wed: "8:00-17:30", thu: "8:00-17:30", fri: "8:00-17:30", sat: "8:00-14:00", sun: "closed" },
  passenger: true,
  lightTruck: true,
  trailer: true,
  wheels: true,
  tbr: false,
  appointmentEnabled: true,
  sameDayEnabled: false, // only flip on when operationally verified (spec Hook 2)
  preferredStatus: "OWNED" as const,
  active: true,
};

async function main() {
  const rhino = await db.location.findFirst({ where: { name: { contains: "Rhino", mode: "insensitive" } } });
  if (!rhino) throw new Error("Rhino location not found — aborting, nothing written.");
  const everflow = await db.location.findFirst({ where: { name: { contains: "Everflow", mode: "insensitive" } } });

  await db.brandConfig.upsert({
    where: { key: "RHINO" },
    update: { locationId: rhino.id, phone: "+14077775598", phoneDisplay: "(407) 777-5598" },
    create: {
      key: "RHINO",
      domain: "rhinotiresusa.com",
      name: "Rhino Tire USA",
      legalName: "RHINO TIRE USA LLC",
      phone: "+14077775598", // owner-confirmed wholesale line, 2026-07-11
      phoneDisplay: "(407) 777-5598",
      addressJson: { streetAddress: "Orlando, FL", addressLocality: "Orlando", addressRegion: "FL", addressCountry: "US" },
      networkName: "RHINO Local Installer Network",
      locationId: rhino.id,
      active: true,
    },
  });

  if (everflow) {
    const everflowConfig = {
      key: "EVERFLOW",
      domain: "everflowtireusa.com", // owner-confirmed 2026-07-22
      name: "Everflow Tires & Wheels",
      legalName: "EVERFLOW TIRES & WHEELS LLC",
      phone: "+19033376132", // Edward Henry, owner-confirmed
      phoneDisplay: "(903) 337-6132",
      contactEmail: "everflowtire@gmail.com",
      addressJson: { streetAddress: "5091 Pulaski St", addressLocality: "Dallas", addressRegion: "TX", postalCode: "75247", addressCountry: "US" },
      networkName: "EVERFLOW Preferred Dealer Network",
      active: true, // EVERFLOW launch (Phase D)
      locationId: everflow.id,
    };
    await db.brandConfig.upsert({
      where: { key: "EVERFLOW" },
      update: everflowConfig,
      create: everflowConfig,
    });
  }

  const existing = await db.installer.findFirst({ where: { storeName: IDEAL.storeName, zip: IDEAL.zip } });
  if (existing) {
    await db.installer.update({ where: { id: existing.id }, data: { ...IDEAL, locationId: rhino.id } });
    console.log("IDEAL installer updated:", existing.id);
  } else {
    const created = await db.installer.create({ data: { ...IDEAL, locationId: rhino.id } });
    console.log("IDEAL installer created:", created.id);
  }

  console.log("Platform config upserted. Brands:", (await db.brandConfig.findMany({ select: { key: true, active: true } })));
}

main().finally(() => db.$disconnect());
