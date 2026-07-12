import { PrismaClient } from "@prisma/client";
import { SEED_ARTICLES } from "./seed-articles-data";

const db = new PrismaClient();
(async () => {
  for (const a of SEED_ARTICLES) {
    await db.article.upsert({
      where: { slug: a.slug },
      update: {},
      create: { ...a, brandKey: "RHINO", published: true, publishedAt: new Date("2026-07-11") },
    });
  }
  console.log("articles:", await db.article.count());
  await db.$disconnect();
})();
