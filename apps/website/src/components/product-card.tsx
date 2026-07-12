import Link from "next/link";
import type { PublicProductDTO } from "@rhino/services";
import { STOCK_LABEL } from "@/lib/site";
import { TireGraphic } from "@/components/graphics";

export function StockBadge({ status }: { status: PublicProductDTO["stockStatus"] }) {
  const style =
    status === "IN_STOCK"
      ? "bg-emerald-100 text-emerald-800"
      : status === "LIMITED"
        ? "bg-amber-100 text-amber-800"
        : "bg-steel-100 text-steel-500";
  return <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${style}`}>{STOCK_LABEL[status]}</span>;
}

/** Premium product card: brand eyebrow, condensed name, big size, badges. */
export function ProductCard({ p }: { p: PublicProductDTO }) {
  const img = p.images.find((i) => i.isPrimary) ?? p.images[0];
  return (
    <Link
      href={`/products/${p.slug}`}
      className="group flex flex-col rounded-2xl border border-steel-200 bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:border-brand hover:shadow-lift"
    >
      <div className="relative mb-3 flex h-36 items-center justify-center rounded-xl bg-gradient-to-b from-steel-100 to-white">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img.url} alt={img.alt} className="h-32 w-full object-contain" loading="lazy" />
        ) : (
          <TireGraphic className="h-28 w-28" />
        )}
        {p.tireSpec?.loadRange && (
          <span className="absolute right-2 top-2 rounded-md bg-navy-900 px-2 py-0.5 text-[11px] font-bold text-brand-light">
            LR {p.tireSpec.loadRange}
          </span>
        )}
      </div>
      {p.brand && <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-steel-500">{p.brand}</div>}
      <div className="font-display text-lg font-bold uppercase leading-tight text-navy-900">{p.sizeSpec ?? p.name}</div>
      <div className="mt-0.5 line-clamp-2 text-xs text-steel-500">{p.name}</div>
      <div className="mt-1 text-[11px] text-steel-400">SKU {p.sku}</div>
      <div className="mt-auto flex items-center justify-between border-t border-steel-100 pt-3">
        <StockBadge status={p.stockStatus} />
        <span className="text-xs font-bold text-brand-dark transition group-hover:translate-x-0.5">Dealer price →</span>
      </div>
    </Link>
  );
}
