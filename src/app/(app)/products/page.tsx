import { db } from "@/lib/db";
import { requireSession, isManager } from "@/lib/auth";
import { Table, THead, EmptyRow, Badge, StatCard } from "@/components/ui/primitives";
import { ProductsFilter } from "@/components/products-filter";
import { DiscontinuedToggle } from "@/components/discontinued-toggle";
import { ProductImageCell } from "@/components/product-image-cell";
import { productImageUrl, isStorageConfigured } from "@/lib/storage";
import { fmtMoney } from "@/lib/domain";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

type Search = { q?: string; cat?: string; stock?: string };

export default async function ProductsPage({ searchParams }: { searchParams: Search }) {
  const session = await requireSession();
  const manager = isManager(session);

  const where: Prisma.ProductWhereInput = { active: true };
  const q = searchParams.q?.trim();
  if (q) {
    where.OR = [
      { sku: { contains: q, mode: "insensitive" } },
      { sizeSpec: { contains: q, mode: "insensitive" } },
      { brand: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }
  if (searchParams.cat) where.rawCategory = searchParams.cat;
  // stock filter belongs in the DB query, not post-filtering the first 200 rows
  if (searchParams.stock === "in") where.inventory = { some: { quantity: { gt: 0 } } };
  if (searchParams.stock === "out") where.NOT = { inventory: { some: { quantity: { gt: 0 } } } };

  const [locations, categories, totalCount, products] = await Promise.all([
    db.location.findMany({ where: { active: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, shortTag: true } }),
    db.product.findMany({ where: { active: true, rawCategory: { not: null } }, distinct: ["rawCategory"], select: { rawCategory: true }, orderBy: { rawCategory: "asc" } }),
    db.product.count({ where }),
    db.product.findMany({
      where,
      orderBy: [{ sizeSpec: "asc" }, { sku: "asc" }],
      take: 200,
      include: { inventory: { select: { locationId: true, quantity: true } } },
    }),
  ]);
  const storageReady = isStorageConfigured();

  const qtyAt = (p: (typeof products)[number], locId: string) =>
    p.inventory.find(i => i.locationId === locId)?.quantity ?? null;

  const rows = products.map(p => ({ p, stocks: locations.map(l => qtyAt(p, l.id)) }));

  const totalUnits = await db.inventorySnapshot.groupBy({ by: ["locationId"], _sum: { quantity: true } });
  const unitsAt = (locId: string) => totalUnits.find(t => t.locationId === locId)?._sum.quantity ?? 0;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Products &amp; Stock <span className="text-sm font-normal text-slate-400">({totalCount} SKUs)</span></h1>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Active SKUs" value={totalCount} />
        {locations.map(l => (
          <StatCard key={l.id} label={`${l.name} units on hand`} value={unitsAt(l.id).toLocaleString()} />
        ))}
      </div>

      <ProductsFilter categories={categories.map(c => c.rawCategory!).filter(Boolean)} />

      <Table>
        <THead cols={[...(manager && storageReady ? ["Photo"] : []), "SKU", "Brand", "Category", "Size", "Description", ...(manager ? ["Cost"] : []), ...locations.map(l => `${l.shortTag} Stock`), ...(manager ? ["Disc."] : [])]} />
        <tbody>
          {rows.map(({ p, stocks }) => (
            <tr key={p.id} className={`border-b border-slate-50 hover:bg-slate-50 ${p.discontinued ? "opacity-70" : ""}`}>
              {manager && storageReady && (
                <td className="px-3 py-2"><ProductImageCell productId={p.id} imageUrl={productImageUrl(p.imagePath)} storageReady={storageReady} /></td>
              )}
              <td className="px-3 py-2 font-mono text-xs text-slate-700 whitespace-nowrap">
                {p.sku}
                {p.discontinued && <Badge className="ml-1.5 bg-red-100 text-red-700">DISC</Badge>}
              </td>
              <td className="px-3 py-2">{p.brand ?? "—"}</td>
              <td className="px-3 py-2"><Badge>{p.rawCategory ?? "—"}</Badge></td>
              <td className="px-3 py-2 font-medium whitespace-nowrap">{p.sizeSpec ?? "—"}</td>
              <td className="px-3 py-2 text-slate-600">{p.description}</td>
              {manager && <td className="px-3 py-2 tabular-nums">{p.cost === null ? "—" : fmtMoney(Number(p.cost))}</td>}
              {stocks.map((s, i) => (
                <td key={i} className="px-3 py-2 tabular-nums">
                  {s === null ? <span className="text-slate-300">—</span>
                    : s === 0 ? <span className="font-semibold text-red-600">0</span>
                    : s <= 4 ? <span className="font-semibold text-amber-600">{s}</span>
                    : <span className="font-semibold text-emerald-700">{s}</span>}
                </td>
              ))}
              {manager && <td className="px-3 py-2"><DiscontinuedToggle productId={p.id} value={p.discontinued} /></td>}
            </tr>
          ))}
          {rows.length === 0 && <EmptyRow colSpan={7 + locations.length} message="No products match your search." />}
        </tbody>
      </Table>
      {totalCount > 200 && <p className="text-xs text-slate-400">Showing first 200 of {totalCount} — refine your search to narrow down.</p>}
    </div>
  );
}
