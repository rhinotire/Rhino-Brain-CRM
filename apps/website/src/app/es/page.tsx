import Link from "next/link";
import type { Metadata } from "next";
import { getBrand } from "@/lib/brand";
import { ES_COPY } from "@/lib/es-copy";
import { HeroTireWheel, TreadTexture, TireIcon, WheelIcon, TruckIcon, TrailerIcon } from "@/components/graphics";
import { TireSearch } from "@/components/tire-search";
import { SetLang } from "@/components/lang";

export const metadata: Metadata = {
  title: ES_COPY.homeTitle,
  description: ES_COPY.homeDescription,
  alternates: { canonical: "/es", languages: { en: "/", es: "/es" } },
};

export const revalidate = 300;

export default async function HomePageEs() {
  const brand = await getBrand();
  return (
    <div className="space-y-16">
      <SetLang lang="es" />
      {/* ============ HERO — same navy/gold system as the English home ============ */}
      <section className="relative left-1/2 w-screen -translate-x-1/2 overflow-hidden bg-navy-950 text-white">
        <div className="absolute inset-0 bg-gradient-to-br from-navy-900 via-navy-950 to-navy-900" />
        <TreadTexture className="absolute inset-0 h-full w-full text-white/[0.05]" />
        <div className="absolute -right-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-brand/15 blur-3xl" />
        <div className="absolute -bottom-40 left-1/4 h-80 w-80 rounded-full bg-steel-400/10 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-14 pt-12 sm:pt-16 md:grid-cols-[1fr_minmax(260px,400px)]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-brand-light">{ES_COPY.heroTagline}</p>
            <h1 className="h-display mt-4 max-w-2xl text-5xl sm:text-7xl">
              Llantas. Rines.<br />
              <span className="text-brand">Precio de Mayoreo.</span>
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-steel-300">{ES_COPY.heroBlurb}</p>
            <div className="mt-7">
              <TireSearch es />
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/es/quote" className="btn-gold">Solicitar Cotización</Link>
              <Link href="/es/become-a-dealer" className="btn-ghost-dark">Hágase Distribuidor</Link>
              <Link href="/es/find-installation" className="btn-ghost-dark">Buscar Instalación</Link>
            </div>
          </div>
          <div className="hidden md:block">
            <HeroTireWheel className="mx-auto w-full max-w-[400px] drop-shadow-2xl" />
            <p className="mt-6 text-center">
              <span className="h-display text-2xl text-white">
                Distribuidores Siempre <span className="text-brand">Rodando</span>
              </span>
              <span className="mt-1.5 block text-[11px] font-bold uppercase tracking-[0.3em] text-steel-300">
                {ES_COPY.citiesLine}
              </span>
            </p>
          </div>
        </div>
        {/* metallic stat band */}
        <div className="relative border-t border-white/10 bg-gradient-to-r from-navy-900 via-navy-800 to-navy-900">
          <div className="mx-auto grid max-w-6xl gap-x-6 gap-y-2 px-4 py-4 sm:grid-cols-3">
            {[
              [TruckIcon, ES_COPY.deliveryStat],
              [TireIcon, "Más de 1,000 medidas de llantas y rines en existencia"],
              [WheelIcon, "Programas de tarimas y contenedores, cargas mixtas"],
            ].map(([Icon, text]) => {
              const I = Icon as typeof TruckIcon;
              return (
                <div key={text as string} className="flex items-center gap-2.5 text-sm font-semibold text-steel-200">
                  <I className="h-5 w-5 shrink-0 text-brand" /> {text as string}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============ categorías ============ */}
      <section>
        <h2 className="h-display text-3xl text-navy-900">Compre por Categoría</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { href: "/es/tires/st-trailer", Icon: TrailerIcon, title: "Llantas de Remolque ST", blurb: "ST175/80R13 a ST235/85R16 — la especialidad de la casa" },
            { href: "/es/tires/passenger", Icon: TireIcon, title: "Llantas de Auto y Camioneta", blurb: "Touring, LT y todo terreno a precio de mayoreo" },
            { href: "/es/tires/commercial-truck", Icon: TruckIcon, title: "Llantas de Camión", blurb: "Posiciones de dirección, tracción y remolque" },
            { href: "/wheels", Icon: WheelIcon, title: "Rines y Refacciones", blurb: "Rines de remolque, birlos, masas y más" },
          ].map(({ href, Icon, title, blurb }) => (
            <Link key={href} href={href} className="group rounded-2xl border border-steel-200 bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:border-brand hover:shadow-lift">
              <Icon className="h-8 w-8 text-brand" />
              <div className="mt-3 font-bold text-navy-900 group-hover:text-brand-dark">{title}</div>
              <p className="mt-1 text-sm text-steel-500">{blurb}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* ============ dos caminos: negocio / consumidor ============ */}
      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl bg-navy-900 p-7 text-white">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-brand-light">Para llanteras · fabricantes · flotillas</div>
          <h2 className="h-display mt-2 text-2xl">¿Compra para su negocio?</h2>
          <p className="mt-2 text-sm text-steel-300">
            Precios por niveles A–D, tarimas mixtas y contenedores completos. Atendemos en español — llámenos al{" "}
            <a href={`tel:${brand.phone}`} className="font-bold text-brand-light">{brand.phoneDisplay}</a>.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/es/quote" className="btn-gold">Cotización de Mayoreo</Link>
            <Link href="/es/become-a-dealer" className="btn-ghost-dark">Abrir Cuenta de Distribuidor</Link>
          </div>
        </div>
        <div className="rounded-2xl border-2 border-brand bg-white p-7">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-brand-dark">Para conductores y dueños de remolques</div>
          <h2 className="h-display mt-2 text-2xl text-navy-900">¿Necesita llantas instaladas?</h2>
          <p className="mt-2 text-sm text-steel-500">
            Ingrese la medida de su llanta y su código postal — le mostramos opciones de instalación profesional cerca de usted.
          </p>
          <div className="mt-5">
            <Link href="/es/find-installation" className="btn-navy">Buscar Instalación Cerca de Mí</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
