import Link from "next/link";
import { db } from "@/lib/db";
import { requireSession, isManager, seesAllLocations } from "@/lib/auth";
import { Table, THead, EmptyRow, Badge, StatCard } from "@/components/ui/primitives";
import { ShopifySyncButton } from "@/components/shopify-sync-button";
import { ProductsFilter } from "@/components/products-filter";
import { DiscontinuedToggle } from "@/components/discontinued-toggle";
import { WebPublishToggle } from "@/components/web-publish-toggle";
import { ProductImageCell } from "@/components/product-image-cell";
import { MsrpCell } from "@/components/msrp-cell";
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
    const or: Prisma.ProductWhereInput[] = [
      { sku: { contains: q, mode: "insensitive" } },
      { sizeSpec: { contains: q, mode: "insensitive" } },
      { brand: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
    // Digit-normalized size match: "2057515" should find "ST205/75R15-8PR".
    // Plain contains can't bridge the ST / R / -8PR separators, so strip the stored
    // size down to digits only and compare against the digits the user typed.
    const qDigits = q.replace(/[^0-9]/g, "");
    if (qDigits.length >= 4) {
      const like = `%${qDigits}%`;
      const rows = await db.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Product"
        WHERE regexp_replace(coalesce("sizeSpec", ''), '[^0-9]', '', 'g') LIKE ${like}`;
      if (rows.length) or.push({ id: { in: rows.map(r => r.id) } });
    }
    where.OR = or;
  }
  if (searchParams.cat) where.rawCategory = searchParams.cat;
  // Reps/managers only ever see their own location's stock; admins & accounting see all.
  const allLoc = seesAllLocations(session);
  const stockLoc = allLoc ? {} : session.locationId ? { locationId: session.locationId } : {};
  // stock filter belongs in the DB query, not post-filtering the first 200 rows
  if (searchParams.stock === "in") where.inventory = { some: { ...stockLoc, quantity: { gt: 0 } } };
  if (searchParams.stock === "out") where.NOT = { inventory: { some: { ...stockLoc, quantity: { gt: 0 } } } };

  const [allLocations, categories, totalCount, products] = await Promise.all([
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
  // Non-admins see only their own location's stock column & unit totals.
  const locations = allLoc ? allLocations : allLocations.filter(l => l.id === session.locationId);

  const qtyAt = (p: (typeof products)[number], locId: string) =>
    p.inventory.find(i => i.locationId === locId)?.quantity ?? null;

  const rows = products.map(p => ({ p, stocks: locations.map(l => qtyAt(p, l.id)) }));

  const totalUnits = await db.inventorySnapshot.groupBy({ by: ["locationId"], _sum: { quantity: true } });
  const unitsAt = (locId: string) => totalUnits.find(t => t.locationId === locId)?._sum.quantity ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Products &amp; Stock <span className="text-sm font-normal text-slate-400">({totalCount} SKUs)</span></h1>
        {session.role === "ADMIN" && <ShopifySyncButton />}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Active SKUs" value={totalCount} />
        {locations.map(l => (
          <StatCard key={l.id} label={`${l.name} units on hand`} value={unitsAt(l.id).toLocaleString()} />
        ))}
      </div>

      <ProductsFilter categories={categories.map(c => c.rawCategory!).filter(Boolean)} />

      <Table>
        <THead cols={[...(manager && storageReady ? ["Photo"] : []), "SKU", "Brand", "Category", "Size", "Description", ...(manager ? ["Cost", "MSRP"] : []), ...locations.map(l => `${l.shortTag} Stock`), ...(manager ? ["Disc.", "Web"] : [])]} />
        <tbody>
          {rows.map(({ p, stocks }) => (
            <tr key={p.id} className={`border-b border-slate-50 hover:bg-slate-50 ${p.discontinued ? "opacity-70" : ""}`}>
              {manager && storageReady && (
                <td className="px-3 py-2"><ProductImageCell key={p.imagePath ?? "none"} productId={p.id} imageUrl={productImageUrl(p.imagePath)} storageReady={storageReady} /></td>
              )}
              <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                {manager ? (
                  <Link href={`/products/${p.id}/specs`} title="Edit specs (UTQG, warranty, load index…)"
                    className="text-blue-700 hover:underline">{p.sku}</Link>
                ) : (
                  <span className="text-slate-700">{p.sku}</span>
                )}
                {p.discontinued && <Badge className="ml-1.5 bg-red-100 text-red-700">DISC</Badge>}
              </td>
              <td className="px-3 py-2">{p.brand ?? "—"}</td>
              <td className="px-3 py-2"><Badge>{p.rawCategory ?? "—"}</Badge></td>
              <td className="px-3 py-2 font-medium whitespace-nowrap">{p.sizeSpec ?? "—"}</td>
              <td className="px-3 py-2 text-slate-600">{p.description}</td>
              {manager && <td className="px-3 py-2 tabular-nums">{p.cost === null ? "—" : fmtMoney(Number(p.cost))}</td>}
              {manager && <td className="px-3 py-2"><MsrpCell productId={p.id} msrp={p.msrp === null ? null : Number(p.msrp)} /></td>}
              {stocks.map((s, i) => (
                <td key={i} className="px-3 py-2 tabular-nums">
                  {s === null ? <span className="text-slate-300">—</span>
                    : s === 0 ? <span className="font-semibold text-red-600">0</span>
                    : s <= 4 ? <span className="font-semibold text-amber-600">{s}</span>
                    : <span className="font-semibold text-emerald-700">{s}</span>}
                </td>
              ))}
              {manager && <td className="px-3 py-2"><DiscontinuedToggle productId={p.id} value={p.discontinued} /></td>}
              {manager && <td className="px-3 py-2"><WebPublishToggle key={p.visibility} productId={p.id} published={p.visibility === "PUBLIC"} /></td>}
            </tr>
          ))}
          {rows.length === 0 && <EmptyRow colSpan={8 + locations.length} message="No products match your search." />}
        </tbody>
      </Table>
      {totalCount > 200 && <p className="text-xs text-slate-400">Showing first 200 of {totalCount} — refine your search to narrow down.</p>}
    </div>
  );
}
