import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Competitor price watch (owner request 2026-10-20). The owner's PC robot
 * holds his dealer logins for QTD / TGI / Tire Dispatch locally and checks a
 * size watchlist daily.
 *   GET  → { sizes: [{sizeKey, display}] } — top stocked tire sizes to watch
 *   POST → { site, rows: [{sizeKey, description, partCode?, availability?, fet?, price}] }
 * Bearer CRON_SECRET.
 */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // watchlist = tire sizes with the most units on hand across both warehouses
  const products = await db.product.findMany({
    where: {
      active: true,
      category: { in: ["PCR_TIRES", "LT_TIRES", "TBR_TIRES", "TRAILER_TIRES"] },
      sizeSpec: { not: null },
      inventory: { some: { quantity: { gt: 0 } } },
    },
    select: { sizeSpec: true, inventory: { select: { quantity: true } } },
  });
  const bySize = new Map<string, { display: string; qty: number }>();
  for (const p of products) {
    const display = p.sizeSpec!.trim();
    const sizeKey = display.replace(/\D/g, "");
    if (sizeKey.length < 5) continue;
    const qty = p.inventory.reduce((s, i) => s + i.quantity, 0);
    const cur = bySize.get(sizeKey);
    if (cur) cur.qty += qty; else bySize.set(sizeKey, { display, qty });
  }
  const sizes = [...bySize.entries()]
    .sort((a, b) => b[1].qty - a[1].qty)
    .slice(0, 30)
    .map(([sizeKey, v]) => ({ sizeKey, display: v.display }));
  return NextResponse.json({ sizes });
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { site, rows } = (await req.json()) as {
    site: string;
    rows: { sizeKey: string; description: string; partCode?: string; availability?: string; fet?: number; price: number }[];
  };
  if (!site || !Array.isArray(rows)) return NextResponse.json({ error: "site and rows required" }, { status: 400 });
  const clean = rows.filter(r => r.sizeKey && r.description && Number.isFinite(r.price) && r.price > 0).slice(0, 2000);
  const sizeKeys = [...new Set(clean.map(r => r.sizeKey))];
  // snapshot semantics per site+size
  await db.competitorPrice.deleteMany({ where: { site, sizeKey: { in: sizeKeys } } });
  for (let i = 0; i < clean.length; i += 500) {
    await db.competitorPrice.createMany({
      data: clean.slice(i, i + 500).map(r => ({
        site,
        sizeKey: r.sizeKey.slice(0, 20),
        description: r.description.slice(0, 120),
        partCode: r.partCode?.slice(0, 40) ?? null,
        availability: r.availability?.slice(0, 30) ?? null,
        fet: r.fet ?? null,
        price: r.price,
      })),
    });
  }
  return NextResponse.json({ ok: true, stored: clean.length, sizes: sizeKeys.length });
}
