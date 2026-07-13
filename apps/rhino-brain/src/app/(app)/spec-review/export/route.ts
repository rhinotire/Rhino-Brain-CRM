import { db } from "@/lib/db";
import { requireManager } from "@/lib/auth";

const TIRE_CATS = ["PCR_TIRES", "LT_TIRES", "TBR_TIRES", "TRAILER_TIRES"] as const;
const SPEC_COLUMNS = ["loadRange", "plyRating", "position", "treadType", "construction", "loadIndex", "speedRating", "application", "mileageWarrantyMiles"] as const;

const csvCell = (v: unknown): string => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Gap sheet: every active tire product with at least one unfilled spec field.
 * Known values are pre-filled so the sheet doubles as a review copy; fill the
 * blanks from supplier data sheets and re-import on /spec-review.
 */
export async function GET() {
  await requireManager();

  const products = await db.product.findMany({
    where: { category: { in: [...TIRE_CATS] }, active: true },
    select: { sku: true, brand: true, sizeSpec: true, description: true, category: true, tireSpec: true },
    orderBy: [{ category: "asc" }, { sku: "asc" }],
  });

  const rows = products.filter((p) => {
    const spec = (p.tireSpec ?? {}) as Record<string, unknown>;
    return SPEC_COLUMNS.some((f) => spec[f] === null || spec[f] === undefined || spec[f] === "");
  });

  const header = ["sku", "brand", "sizeSpec", "description", "category", ...SPEC_COLUMNS];
  const lines = [header.join(",")];
  for (const p of rows) {
    const spec = (p.tireSpec ?? {}) as Record<string, unknown>;
    lines.push([
      csvCell(p.sku), csvCell(p.brand), csvCell(p.sizeSpec), csvCell(p.description), csvCell(p.category),
      ...SPEC_COLUMNS.map((f) => csvCell(spec[f])),
    ].join(","));
  }

  return new Response(lines.join("\r\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="tire-spec-gaps-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
