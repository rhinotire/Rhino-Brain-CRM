import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicCatalogService } from "@rhino/services";
import { ProductCard } from "@/components/product-card";
import { JsonLd } from "@/components/json-ld";
import { CATEGORY_SLUGS, POPULAR_BY_CATEGORY, SITE } from "@/lib/site";
import { SizeBrowser } from "@/components/size-browser";
import { ES_COPY, CATEGORY_LABEL_ES } from "@/lib/es-copy";
import { SetLang } from "@/components/lang";

export const revalidate = 300;

export function generateStaticParams() {
  return Object.keys(CATEGORY_SLUGS).map((sub) => ({ sub }));
}

type Params = { sub: string };

/** Spanish B2B landing content for the two commercial-heavy categories. */
const B2B_SECTIONS_ES: Record<
  string,
  { intro: string; heading: string; bullets: string[]; ctas: { href: string; label: string; primary?: boolean }[] }
> = {
  "commercial-truck": {
    intro:
      "Llantas de dirección, tracción, remolque y toda posición para flotillas, operadores independientes y distribuidores comerciales — a precio de distribuidor.",
    heading: "¿Compra para una flotilla?",
    bullets: [
      "Todas las posiciones con un solo proveedor — dirección, tracción, remolque, toda posición",
      "Consolidación de medidas y planeación de reemplazos para flotillas",
      ES_COPY.deliveryStat,
      "Búsqueda de emergencia a través de nuestra red de proveedores cuando una unidad está parada",
    ],
    ctas: [
      { href: "/es/quote", label: "Cotizar Llantas de Camión", primary: true },
      { href: "/es/become-a-dealer", label: "Cuenta de Distribuidor" },
    ],
  },
  "st-trailer": {
    intro:
      "Llantas ST para remolque y conjuntos montados de llanta y rin para fabricantes de remolques, distribuidores y talleres — rangos de carga pesada, según la placa del remolque.",
    heading: "Fabricantes y distribuidores de remolques",
    bullets: [
      "Conjuntos montados listos para atornillar — llanta y rin ensamblados",
      "Rangos de carga pesada para remolques utilitarios, de lancha, caballos, cerrados y de equipo",
      "Suministro de fábrica por volumen — programas recurrentes de tarimas y contenedores",
      ES_COPY.dealerBenefits[1],
    ],
    ctas: [
      { href: "/es/quote", label: "Cotizar Llanta y Rin de Remolque", primary: true },
      { href: "/es/become-a-dealer", label: "Precio de Fábrica" },
    ],
  },
};

export function generateMetadata({ params }: { params: Params }): Metadata {
  const cat = CATEGORY_SLUGS[params.sub];
  if (!cat) return {};
  const label = CATEGORY_LABEL_ES[params.sub] ?? cat.label;
  return {
    title: `${label} — Precio de Mayoreo y Existencias en Vivo`,
    description: `${label} al mayoreo con existencias en vivo. Precio de distribuidor — solicite una cotización o abra una cuenta de distribuidor.`,
    alternates: {
      canonical: `/es/tires/${params.sub}`,
      languages: { en: `/tires/${params.sub}`, es: `/es/tires/${params.sub}` },
    },
  };
}

export default async function SubcategoryPageEs({ params }: { params: Params }) {
  const cat = CATEGORY_SLUGS[params.sub];
  if (!cat) notFound();
  const label = CATEGORY_LABEL_ES[params.sub] ?? cat.label;

  const products = await PublicCatalogService.listPublished({ category: cat.db, take: 1000 });
  const sizes = [...new Set(products.map((p) => p.sizeSpec).filter((s): s is string => !!s))];

  // top 10 = medidas con más productos publicados
  const counts = new Map<string, number>();
  for (const p of products) if (p.sizeSpec) counts.set(p.sizeSpec, (counts.get(p.sizeSpec) ?? 0) + 1);
  const top10 = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([s]) => s);

  return (
    <div className="pt-8">
      <SetLang lang="es" />
      <nav aria-label="Ruta de navegación" className="text-xs text-slate-500">
        <Link href="/es">Inicio</Link> / <Link href="/es/tires">Llantas</Link> / {label}
      </nav>
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-3">
        <h1 className="text-2xl font-black">{label}</h1>
        <form action="/es/tires" method="get" className="flex gap-2">
          <label htmlFor="cat-q" className="sr-only">Buscar medida</label>
          <input id="cat-q" name="q" placeholder='Buscar medida — "2055516"' autoComplete="off"
            className="w-56 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <button className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-ink">Buscar</button>
        </form>
      </div>
      {B2B_SECTIONS_ES[params.sub] && (
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">{B2B_SECTIONS_ES[params.sub].intro}</p>
      )}

      <SizeBrowser sizes={sizes} hrefBase={`/tires/${params.sub}`} popular={top10.length ? top10 : POPULAR_BY_CATEGORY[params.sub]} es />

      {products.length ? (
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {products.map((p) => (
            <ProductCard key={p.sku} p={p} es />
          ))}
        </div>
      ) : (
        <p className="mt-6 rounded-xl bg-slate-50 p-6 text-sm text-slate-600">
          El catálogo de esta categoría se está publicando. Llame al {SITE.phoneDisplay} o{" "}
          <Link href="/es/quote" className="font-bold text-brand-dark">solicite una cotización</Link> — tenemos más de lo que muestra el sitio.
        </p>
      )}

      {B2B_SECTIONS_ES[params.sub] && (
        <section className="mt-10 rounded-2xl bg-navy-900 p-6 text-white">
          <h2 className="h-display text-2xl">{B2B_SECTIONS_ES[params.sub].heading}</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-steel-300">
            {B2B_SECTIONS_ES[params.sub].bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
          <div className="mt-5 flex flex-wrap gap-3">
            {B2B_SECTIONS_ES[params.sub].ctas.map((c) => (
              <Link key={c.href} href={c.href} className={c.primary ? "btn-gold" : "btn-ghost-dark"}>
                {c.label}
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
                { "@type": "ListItem", position: 1, name: "Inicio", item: `${SITE.url}/es` },
                { "@type": "ListItem", position: 2, name: "Llantas", item: `${SITE.url}/es/tires` },
                { "@type": "ListItem", position: 3, name: label, item: `${SITE.url}/es/tires/${params.sub}` },
              ],
            },
            {
              "@type": "ItemList",
              itemListElement: products.slice(0, 30).map((p, i) => ({
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
