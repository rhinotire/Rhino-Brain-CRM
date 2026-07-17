import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { SPEC_FIELD_VOCAB } from "@rhino/services";
import { TireSpecEditor, type SpecValues } from "@/components/tire-spec-editor";
import { Badge } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

/** Manual spec editor — UTQG, mileage warranty, service values, badges. */
export default async function ProductSpecsPage({ params }: { params: { id: string } }) {
  await requireManager();
  const product = await db.product.findUnique({
    where: { id: params.id },
    select: { id: true, sku: true, brand: true, pattern: true, sizeSpec: true, description: true, visibility: true, tireSpec: true },
  });
  if (!product) notFound();

  const patternCount = product.pattern && product.brand
    ? await db.product.count({ where: { active: true, brand: product.brand, pattern: product.pattern, NOT: { id: product.id } } })
    : 0;

  const t = product.tireSpec;
  const spec: SpecValues = {
    loadIndex: t?.loadIndex ?? null,
    speedRating: t?.speedRating ?? null,
    loadRange: t?.loadRange ?? null,
    plyRating: t?.plyRating ?? null,
    maxLoadLbs: t?.maxLoadLbs ?? null,
    maxPressurePsi: t?.maxPressurePsi ?? null,
    treadDepth32nds: t?.treadDepth32nds === null || t?.treadDepth32nds === undefined ? null : Number(t.treadDepth32nds),
    treadType: t?.treadType ?? null,
    application: t?.application ?? null,
    position: t?.position ?? null,
    construction: t?.construction ?? null,
    utqg: t?.utqg ?? null,
    sidewallStyle: t?.sidewallStyle ?? null,
    mileageWarrantyMiles: t?.mileageWarrantyMiles ?? null,
    threePMSF: t?.threePMSF ?? false,
    runFlat: t?.runFlat ?? false,
  };

  return (
    <div className="max-w-3xl space-y-4">
      <nav className="text-xs text-slate-500">
        <Link href="/products" className="hover:underline">Products &amp; Stock</Link> / Specs
      </nav>
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-xl font-bold">{product.sku}</h1>
        {product.sizeSpec && <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-sm">{product.sizeSpec}</span>}
        {product.brand && <span className="text-sm text-slate-500">{product.brand}</span>}
        <Badge className={product.visibility === "PUBLIC" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}>
          {product.visibility === "PUBLIC" ? "LIVE" : "not published"}
        </Badge>
      </div>
      <p className="text-sm text-slate-500">{product.description}</p>

      <TireSpecEditor
        productId={product.id}
        pattern={product.pattern}
        patternCount={patternCount}
        spec={spec}
        vocab={{
          treadType: [...SPEC_FIELD_VOCAB.treadType],
          application: [...SPEC_FIELD_VOCAB.application],
          position: [...SPEC_FIELD_VOCAB.position],
          loadRange: [...SPEC_FIELD_VOCAB.loadRange],
        }}
      />

      <p className="text-xs text-slate-400">
        Values are validated against the same vocabulary the enrichment pipeline uses. Fields left empty simply don&apos;t
        show on the website — no fake data.
      </p>
    </div>
  );
}
