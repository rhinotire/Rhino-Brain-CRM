import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicCatalogService } from "@rhino/services";
import { StockBadge } from "@/components/product-card";
import { TireSpecs } from "@/components/tire-specs";
import { JsonLd } from "@/components/json-ld";
import { SITE, STOCK_LABEL } from "@/lib/site";

export const revalidate = 300;

/** On-demand ISR — the empty list is REQUIRED to keep this route cached. */
export function generateStaticParams(): { slug: string }[] {
  return [];
}

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const p = await PublicCatalogService.getBySlug(params.slug);
  if (!p) return {};
  return {
    title: `${p.name} — Wholesale`,
    description: `${p.name} (SKU ${p.sku})${p.sizeSpec ? `, size ${p.sizeSpec}` : ""}. ${STOCK_LABEL[p.stockStatus]}. Dealer tier pricing — request a wholesale quote.`,
    alternates: { canonical: `/products/${params.slug}` },
    openGraph: p.images[0] ? { images: [{ url: p.images[0].url, alt: p.images[0].alt }] } : undefined,
  };
}

function SpecTable({ rows }: { rows: [string, string | number | null][] }) {
  const filled = rows.filter(([, v]) => v !== null && v !== "" && v !== undefined);
  if (!filled.length) return null;
  return (
    <div className="overflow-x-auto">
      <table className="mt-2 w-full max-w-xl border-collapse text-sm">
        <tbody>
          {filled.map(([k, v]) => (
            <tr key={k} className="border-b border-slate-200">
              <th scope="row" className="w-1/2 py-2 pr-4 text-left font-semibold text-slate-500">{k}</th>
              <td className="py-2">{String(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function ProductPage({ params }: { params: Params }) {
  const p = await PublicCatalogService.getBySlug(params.slug);
  if (!p) notFound();
  const img = p.images.find((i) => i.isPrimary) ?? p.images[0];

  const availability =
    p.stockStatus === "IN_STOCK"
      ? "https://schema.org/InStock"
      : p.stockStatus === "LIMITED"
        ? "https://schema.org/LimitedAvailability"
        : "https://schema.org/OutOfStock";

  return (
    <div className="pt-8">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
        <Link href="/">Home</Link> / <Link href="/tires">Products</Link> / {p.name}
      </nav>

      <div className="mt-4 grid gap-8 md:grid-cols-2">
        <div>
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img.url} alt={img.alt} className="w-full rounded-2xl border border-slate-200 object-contain" />
          ) : (
            <div className="flex aspect-square items-center justify-center rounded-2xl bg-slate-50 text-6xl" aria-hidden>🛞</div>
          )}
        </div>
        <div>
          {p.brandLogoUrl && (
            <div className="mb-2 flex h-8 items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.brandLogoUrl} alt={p.brand ?? ""} className="max-h-8 w-auto max-w-[160px] object-contain" />
            </div>
          )}
          <h1 className="text-2xl font-black">{p.name}</h1>
          <div className="mt-1 text-sm text-slate-500">
            SKU {p.sku} {p.brand ? `· ${p.brand}` : ""} {p.sizeSpec ? `· ${p.sizeSpec}` : ""}
          </div>
          <div className="mt-3"><StockBadge status={p.stockStatus} /></div>
          {p.msrp !== null && <div className="mt-2 text-sm text-slate-600">Reference price: ${p.msrp.toFixed(2)} — dealers log in for tier pricing</div>}
          <p className="mt-4 text-sm text-slate-700">{p.description}</p>
          {p.features.length > 0 && (
            <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-slate-700">
              {p.features.map((f) => <li key={f}>{f}</li>)}
            </ul>
          )}
          {/* B2B path */}
          <div className="mt-6 rounded-xl bg-slate-50 p-4">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500">Wholesale Buyers — Dealer Pricing Available</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link href={`/quote?sku=${encodeURIComponent(p.sku)}`} className="rounded-lg bg-brand px-5 py-3 text-sm font-bold text-ink">
                Request Volume Quote
              </Link>
              <a href={`tel:${SITE.phone}`} className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-bold">
                Call {SITE.phoneDisplay}
              </a>
            </div>
          </div>
          {/* Consumer path (spec §8) */}
          <div className="mt-3 rounded-xl border-2 border-brand p-4">
            <div className="text-xs font-bold uppercase tracking-wide text-brand-dark">Need This {p.category === "WHEELS" ? "Wheel" : "Tire"} Installed?</div>
            <p className="mt-1 text-sm text-slate-600">Enter your ZIP code to check local installation options.</p>
            <form action="/find-installation" className="mt-2 flex gap-2">
              <input type="hidden" name="size" value={p.sizeSpec ?? ""} />
              <input type="hidden" name="product" value={p.id} />
              <label htmlFor="pp-zip" className="sr-only">ZIP code</label>
              <input id="pp-zip" name="zip" required pattern="\d{5}" inputMode="numeric" placeholder="ZIP code" className="w-32 rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />
              <button className="rounded-lg bg-ink px-4 py-2.5 text-sm font-bold text-white">Find a Store</button>
            </form>
            <p className="mt-3 text-sm">
              Already have a trusted tire shop?{" "}
              <Link href={`/send-to-installer?product=${encodeURIComponent(p.slug)}`} className="font-bold text-brand-dark underline">
                Send this tire to my installer →
              </Link>
            </p>
          </div>
        </div>
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-bold">Specifications</h2>
        {p.tireSpec && <TireSpecs p={p} />}
        {p.wheelSpec && (
          <SpecTable
            rows={[
              ["Diameter (in)", p.wheelSpec.diameterIn],
              ["Width (in)", p.wheelSpec.widthIn],
              ["Bolt Pattern", p.wheelSpec.boltPattern],
              ["Lug Count", p.wheelSpec.lugCount],
              ["Offset (mm)", p.wheelSpec.offsetMm],
              ["Load Rating (lbs)", p.wheelSpec.loadRatingLbs],
              ["Finish", p.wheelSpec.finish],
              ["Material", p.wheelSpec.material],
            ]}
          />
        )}
        {p.partSpec && (
          <SpecTable
            rows={[
              ["Type", p.partSpec.partType],
              ["Capacity", p.partSpec.capacity],
              ["Dimensions", p.partSpec.dimensions],
              ["Material", p.partSpec.material],
              ["Mounting", p.partSpec.mountingType],
              ["Compatibility", p.partSpec.compatibilityNotes],
            ]}
          />
        )}
      </section>

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Product",
          name: p.name,
          sku: p.sku,
          brand: p.brand ? { "@type": "Brand", name: p.brand } : undefined,
          description: p.description,
          image: p.images.map((i) => i.url),
          offers: {
            "@type": "Offer",
            url: `${SITE.url}/products/${p.slug}`,
            availability,
            priceCurrency: "USD",
            // Public reference price only — dealer tier pricing never appears here
            ...(p.msrp !== null ? { price: p.msrp.toFixed(2) } : { price: "0", priceSpecification: undefined }),
            seller: { "@type": "Organization", name: SITE.name },
          },
        }}
      />
    </div>
  );
}
