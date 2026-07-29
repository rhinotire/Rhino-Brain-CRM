import type { Metadata } from "next";
import Link from "next/link";
import { QuoteForm } from "@/components/lead-forms";
import { getBrand } from "@/lib/brand";
import { ES_COPY } from "@/lib/es-copy";
import { SetLang } from "@/components/lang";

export const metadata: Metadata = {
  title: "Solicitar Cotización de Mayoreo",
  description: ES_COPY.quoteDescription,
  alternates: { canonical: "/es/quote", languages: { en: "/quote", es: "/es/quote" } },
};

export default async function QuotePageEs({ searchParams }: { searchParams: { sku?: string } }) {
  const brand = await getBrand();
  return (
    <div className="pt-8">
      <SetLang lang="es" />
      <nav aria-label="Ruta de navegación" className="text-xs text-slate-500">
        <Link href="/es">Inicio</Link> / Cotización
      </nav>
      <h1 className="mt-2 text-2xl font-black">Solicitar Cotización de Mayoreo</h1>
      <p className="mt-2 max-w-xl text-sm text-slate-600">
        Medidas, cantidades y código postal de entrega — es todo lo que necesitamos. ¿Prefiere teléfono o correo? Llame al{" "}
        <a href={`tel:${brand.phone}`} className="font-bold">{brand.phoneDisplay}</a>
        {brand.contactEmail && (
          <> o escriba a <a href={`mailto:${brand.contactEmail}`} className="font-bold text-brand-dark">{brand.contactEmail}</a></>
        )}. Atendemos en español.
      </p>
      <QuoteForm defaultSku={searchParams.sku} es />
    </div>
  );
}
