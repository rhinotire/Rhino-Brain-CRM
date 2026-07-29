import type { Metadata } from "next";
import Link from "next/link";
import { PublicCatalogService, sizeSuggestion } from "@rhino/services";
import { ProductCard } from "@/components/product-card";
import { CATEGORY_SLUGS } from "@/lib/site";
import { ES_COPY, CATEGORY_LABEL_ES, POPULAR_ES } from "@/lib/es-copy";
import { SetLang } from "@/components/lang";

export const metadata: Metadata = {
  title: "Llantas al Mayoreo — Remolque, Auto, Camioneta y Camión",
  description: `Catálogo de llantas al mayoreo por categoría: remolque ST, auto, camioneta y camión. Existencias en vivo. ${ES_COPY.deliveryStat}.`,
  alternates: { canonical: "/es/tires", languages: { en: "/tires", es: "/es/tires" } },
};

export const revalidate = 300;

export default async function TiresHubEs({ searchParams }: { searchParams: { q?: string } }) {
  const q = searchParams.q?.trim();
  const results = q ? await PublicCatalogService.listPublished({ query: q, take: 60 }) : null;

  return (
    <div>
      <SetLang lang="es" />
      {/* page header band */}
      <div className="relative left-1/2 w-screen -translate-x-1/2 bg-navy-900 text-white">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <nav aria-label="Ruta de navegación" className="text-xs text-steel-400">
            <Link href="/es" className="hover:text-white">Inicio</Link> / Llantas
          </nav>
          <h1 className="h-display mt-2 text-4xl">{q ? `Búsqueda: “${q}”` : "Llantas al Mayoreo"}</h1>
          <form action="/es/tires" className="mt-4 flex max-w-lg gap-2">
            <label htmlFor="tires-q" className="sr-only">Buscar medida, SKU o marca</label>
            <input id="tires-q" name="q" defaultValue={q} placeholder='Medida, SKU o marca — ej. "ST235/80R16"'
              className="w-full rounded-lg border-0 px-4 py-3 text-sm text-navy-900" />
            <button className="btn-gold shrink-0">Buscar</button>
          </form>
        </div>
      </div>

      {results ? (
        results.length ? (
          <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
            {results.map((p) => (
              <ProductCard key={p.sku} p={p} es />
            ))}
          </div>
        ) : (
          <div className="mt-8 rounded-2xl bg-steel-100 p-6 text-sm text-steel-500">
            {sizeSuggestion(q ?? "") && (
              <p className="mb-2 font-semibold text-navy-900">{sizeSuggestion(q ?? "")}</p>
            )}
            <p>
              Ningún producto publicado coincide con “{q}”. Llámenos — nuestra bodega tiene más de lo que muestra el sitio, o{" "}
              <Link href="/es/quote" className="font-bold text-brand-dark">solicite una cotización</Link>.
            </p>
          </div>
        )
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Object.keys(CATEGORY_SLUGS).map((slug) => (
            <Link key={slug} href={`/es/tires/${slug}`}
              className="group rounded-2xl border border-steel-200 bg-white p-6 shadow-card transition hover:-translate-y-0.5 hover:border-brand hover:shadow-lift">
              <div className="font-display text-2xl font-bold uppercase text-navy-900">{CATEGORY_LABEL_ES[slug]}</div>
              <div className="mt-1 text-xs text-steel-500">Precio de distribuidor · programas de tarimas y contenedores</div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(POPULAR_ES[slug] ?? []).map((s) => (
                  <span key={s} className="rounded-md bg-steel-100 px-2 py-1 text-xs font-semibold text-navy-800 group-hover:bg-brand/15">{s}</span>
                ))}
              </div>
            </Link>
          ))}
          <Link href="/tires/specialty"
            className="group rounded-2xl border border-steel-200 bg-white p-6 shadow-card transition hover:-translate-y-0.5 hover:border-brand hover:shadow-lift">
            <div className="font-display text-2xl font-bold uppercase text-navy-900">Llantas Especiales</div>
            <div className="mt-1 text-xs text-steel-500">ATV/UTV · carrito de golf · jardinería · industrial · agrícola</div>
          </Link>
          <Link href="/es/quote"
            className="group rounded-2xl border border-steel-200 bg-white p-6 shadow-card transition hover:-translate-y-0.5 hover:border-brand hover:shadow-lift">
            <div className="font-display text-2xl font-bold uppercase text-navy-900">¿No encuentra su medida?</div>
            <div className="mt-1 text-xs text-steel-500">Tenemos más de lo que muestra el sitio — pida cotización →</div>
          </Link>
        </div>
      )}
    </div>
  );
}
