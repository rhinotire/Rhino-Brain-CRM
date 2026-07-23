import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicCatalogService, normalizeSizeInput, type PublicProductDTO } from "@rhino/services";
import { ProductCard } from "@/components/product-card";
import { JsonLd } from "@/components/json-ld";
import { CATEGORY_SLUGS, SITE, sizeKey, sizeToSlug } from "@/lib/site";
import { COPY } from "@/lib/brand-copy";
import { calcTire, formatTireSize, type TireCalc, type TireSpec } from "@/lib/tire-math";

/** Stored sizeSpec (may carry a ply suffix, "ST235/80R16-10PR") → math-ready TireSpec. */
function toTireSpec(sizeSpec: string): { spec: TireSpec; prefix?: string } | null {
  const n = normalizeSizeInput(sizeSpec);
  if (n?.kind === "metric")
    return { spec: { kind: "metric", width: n.width, aspect: n.aspect, rim: n.rim }, prefix: n.prefix || undefined };
  if (n?.kind === "flotation") return { spec: { kind: "flotation", diameterIn: n.diameter, widthIn: n.width, rim: n.rim } };
  return null; // truck rim-only sizes (11R22.5) have no derivable geometry
}

export const revalidate = 300;

type Params = { sub: string; size: string };

const SERVICE_PREFIX: Record<string, string> = {
  ST: "Special Trailer (trailer service only)",
  LT: "Light Truck (higher load reserves)",
  P: "Passenger",
};

export function generateMetadata({ params }: { params: Params }): Metadata {
  const cat = CATEGORY_SLUGS[params.sub];
  const pretty = params.size.toUpperCase().replace(/-/g, " ");
  return {
    title: `${pretty} Tires Wholesale — All SKUs In Stock`,
    description: `Every ${pretty} SKU we stock, with live availability from ${COPY.whShort}. ${cat?.label ?? "Tires"} at dealer pricing.`,
    alternates: { canonical: `/tires/${params.sub}/${params.size}` },
  };
}

/** Unique non-empty values of one tireSpec field across the listed SKUs. */
function specValues(products: PublicProductDTO[], pick: (t: NonNullable<PublicProductDTO["tireSpec"]>) => string | number | null) {
  return [...new Set(products.flatMap((p) => (p.tireSpec ? [pick(p.tireSpec)] : [])).filter((v): v is string | number => v !== null && v !== ""))];
}

/** GEO-quotable breakdown of what each part of the size means, with computed dimensions. */
function SizeBreakdown({ display, spec, calc, prefix }: { display: string; spec: TireSpec; calc: TireCalc; prefix?: string }) {
  const cells =
    spec.kind === "metric"
      ? [
          { part: String(spec.width), meaning: `Section width: ${spec.width} mm (${(spec.width / 25.4).toFixed(2)}") shoulder to shoulder` },
          { part: String(spec.aspect), meaning: `Aspect ratio: sidewall is ${spec.aspect}% of the width (${calc.sidewallIn.toFixed(2)}" tall)` },
          { part: "R", meaning: "Radial construction" },
          { part: String(spec.rim), meaning: `Fits a ${spec.rim}" wheel` },
        ]
      : [
          { part: String(spec.diameterIn), meaning: `Overall diameter: ${spec.diameterIn}" tall` },
          { part: spec.widthIn.toFixed(2), meaning: `Section width: ${spec.widthIn.toFixed(2)}" wide` },
          { part: "R", meaning: "Radial construction" },
          { part: String(spec.rim), meaning: `Fits a ${spec.rim}" wheel` },
        ];
  return (
    <section className="mt-10">
      <h2 className="text-lg font-black">What {display} means</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {prefix && (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="font-display text-2xl font-bold text-navy-900">{prefix}</div>
            <p className="mt-1 text-xs text-slate-600">{SERVICE_PREFIX[prefix]}</p>
          </div>
        )}
        {cells.map((c) => (
          <div key={c.part + c.meaning} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="font-display text-2xl font-bold text-navy-900">{c.part}</div>
            <p className="mt-1 text-xs text-slate-600">{c.meaning}</p>
          </div>
        ))}
      </div>

      <h3 className="mt-6 text-sm font-black uppercase tracking-wide text-slate-700">{display} calculated dimensions</h3>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full max-w-xl text-left text-sm">
          <tbody className="divide-y divide-slate-100">
            {[
              ["Overall diameter", `${calc.diameterIn.toFixed(1)}" (${Math.round(calc.diameterMm)} mm)`],
              ["Section width", `${calc.widthIn.toFixed(2)}"`],
              ["Sidewall height", `${calc.sidewallIn.toFixed(2)}"`],
              ["Circumference", `${calc.circumferenceIn.toFixed(1)}"`],
              ["Revolutions per mile", String(Math.round(calc.revsPerMile))],
              ["Wheel diameter", `${calc.rim}"`],
            ].map(([label, value]) => (
              <tr key={label}>
                <th scope="row" className="py-1.5 pr-6 font-semibold text-slate-600">{label}</th>
                <td className="py-1.5 font-mono text-navy-900">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Comparing against another size?{" "}
        <Link
          href={`/tools/tire-size-calculator?a=${encodeURIComponent((prefix ?? "") + formatTireSize(spec))}`}
          className="font-bold text-brand-dark"
        >
          Run it through the tire size calculator
        </Link>
        .
      </p>
    </section>
  );
}

/** Size page — key SEO surface: lists all SKUs in one size (docs/sitemap.md). */
export default async function SizePage({ params }: { params: Params }) {
  const cat = CATEGORY_SLUGS[params.sub];
  if (!cat) notFound();

  const all = await PublicCatalogService.listPublished({ category: cat.db, take: 200 });
  const wanted = sizeKey(params.size);
  const products = all.filter((p) => p.sizeSpec && sizeKey(p.sizeSpec) === wanted);
  if (!products.length) notFound();

  const displaySize = products[0].sizeSpec!;
  const parsed = toTireSpec(displaySize);
  const calc = parsed ? calcTire(parsed.spec) : null;

  // Real spec data only — a row renders only when at least one SKU carries the field.
  const loadRanges = specValues(products, (t) => (t.loadRange ? `${t.loadRange}${t.plyRating ? ` (${t.plyRating}-ply)` : ""}` : null));
  const speedRatings = specValues(products, (t) => t.speedRating);
  const maxLoads = specValues(products, (t) => t.maxLoadLbs);
  const brands = [...new Set(products.map((p) => p.brand).filter((b): b is string => !!b))];

  // Related sizes for internal linking: same rim first, then the rest of the category.
  const otherSizes = [...new Set(all.map((p) => p.sizeSpec).filter((s): s is string => !!s && sizeKey(s) !== wanted))];
  const sameRim = parsed ? otherSizes.filter((s) => normalizeSizeInput(s)?.rim === parsed.spec.rim) : [];
  const related = [...sameRim, ...otherSizes.filter((s) => !sameRim.includes(s))].slice(0, 12);

  return (
    <div className="pt-8">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
        <Link href="/">Home</Link> / <Link href="/tires">Tires</Link> /{" "}
        <Link href={`/tires/${params.sub}`}>{cat.label}</Link> / {displaySize}
      </nav>
      <h1 className="mt-2 text-2xl font-black">{displaySize} — {products.length} SKU{products.length > 1 ? "s" : ""} in stock program</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        Wholesale {displaySize} {cat.label.toLowerCase()} {COPY.sizeBlurbFrom}. Dealer pricing by tier —
        log in or <Link href="/quote" className="font-bold text-brand-dark">request a quote</Link>.
      </p>

      {(loadRanges.length > 0 || speedRatings.length > 0 || brands.length > 0) && (
        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 rounded-xl bg-slate-50 px-4 py-3 text-xs">
          {brands.length > 0 && (
            <div>
              <dt className="font-bold uppercase tracking-wide text-slate-500">Brands</dt>
              <dd className="mt-0.5 font-semibold text-navy-900">{brands.join(" · ")}</dd>
            </div>
          )}
          {loadRanges.length > 0 && (
            <div>
              <dt className="font-bold uppercase tracking-wide text-slate-500">Load ranges</dt>
              <dd className="mt-0.5 font-semibold text-navy-900">{loadRanges.join(" · ")}</dd>
            </div>
          )}
          {speedRatings.length > 0 && (
            <div>
              <dt className="font-bold uppercase tracking-wide text-slate-500">Speed ratings</dt>
              <dd className="mt-0.5 font-semibold text-navy-900">{speedRatings.join(" · ")}</dd>
            </div>
          )}
          {maxLoads.length > 0 && (
            <div>
              <dt className="font-bold uppercase tracking-wide text-slate-500">Max load</dt>
              <dd className="mt-0.5 font-semibold text-navy-900">up to {Math.max(...maxLoads.map(Number)).toLocaleString()} lbs/tire</dd>
            </div>
          )}
        </dl>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {products.map((p) => (
          <ProductCard key={p.sku} p={p} />
        ))}
      </div>

      {parsed && calc && <SizeBreakdown display={displaySize} spec={parsed.spec} calc={calc} prefix={parsed.prefix} />}

      {related.length > 0 && (
        <section className="mt-10">
          <h2 className="text-sm font-black uppercase tracking-wide text-slate-700">Related {cat.label.toLowerCase()} sizes</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {related.map((s) => (
              <Link key={s} href={`/tires/${params.sub}/${sizeToSlug(s)}`}
                className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold hover:border-brand">
                {s}
              </Link>
            ))}
          </div>
        </section>
      )}

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Home", item: SITE.url },
                { "@type": "ListItem", position: 2, name: "Tires", item: `${SITE.url}/tires` },
                { "@type": "ListItem", position: 3, name: cat.label, item: `${SITE.url}/tires/${params.sub}` },
                { "@type": "ListItem", position: 4, name: `${displaySize} tires`, item: `${SITE.url}/tires/${params.sub}/${params.size}` },
              ],
            },
            {
              "@type": "ItemList",
              name: `${displaySize} tires`,
              itemListElement: products.map((p, i) => ({
                "@type": "ListItem",
                position: i + 1,
                url: `${SITE.url}/products/${p.slug}`,
                name: p.name,
              })),
            },
          ],
        }}
      />
    </div>
  );
}
