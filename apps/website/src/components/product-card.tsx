import Link from "next/link";
import type { PublicProductDTO } from "@rhino/services";
import { STOCK_LABEL } from "@/lib/site";
import { TireGraphic } from "@/components/graphics";

export function StockBadge({ status }: { status: PublicProductDTO["stockStatus"] }) {
  const style =
    status === "IN_STOCK"
      ? "bg-green-100 text-green-800"
      : status === "LIMITED"
        ? "bg-amber-100 text-amber-800"
        : "bg-slate-100 text-slate-600";
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${style}`}>{STOCK_LABEL[status]}</span>;
}

export function ProductCard({ p }: { p: PublicProductDTO }) {
  const img = p.images.find((i) => i.isPrimary) ?? p.images[0];
  return (
    <Link
      href={`/products/${p.slug}`}
      className="flex flex-col rounded-xl border border-slate-200 p-4 transition hover:border-brand hover:shadow-sm"
    >
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img.url} alt={img.alt} className="mb-3 h-32 w-full rounded-lg object-contain" loading="lazy" />
      ) : (
        <div className="mb-3 flex h-32 items-center justify-center rounded-lg bg-slate-50" aria-hidden>
          <TireGraphic className="h-24 w-24 opacity-90" />
        </div>
      )}
      <div className="text-sm font-bold leading-snug">{p.name}</div>
      <div className="mt-1 text-xs text-slate-500">
        {p.sizeSpec} {p.tireSpec?.loadRange ? `· Load Range ${p.tireSpec.loadRange}` : ""} · SKU {p.sku}
      </div>
      <div className="mt-auto flex items-center justify-between pt-3">
        <StockBadge status={p.stockStatus} />
        <span className="text-xs font-semibold text-brand-dark">Log in for your price →</span>
      </div>
    </Link>
  );
}
