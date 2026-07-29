import type { Metadata } from "next";
import Link from "next/link";
import { DealerForm } from "@/components/lead-forms";
import { getBrand } from "@/lib/brand";
import { ES_COPY } from "@/lib/es-copy";
import { SetLang } from "@/components/lang";

export const metadata: Metadata = {
  title: "Hágase Distribuidor — Solicitud de Cuenta de Mayoreo",
  description: ES_COPY.dealerDescription,
  alternates: { canonical: "/es/become-a-dealer", languages: { en: "/become-a-dealer", es: "/es/become-a-dealer" } },
};

export default async function DealerPageEs() {
  const brand = await getBrand();
  return (
    <div className="pt-8">
      <SetLang lang="es" />
      <nav aria-label="Ruta de navegación" className="text-xs text-slate-500">
        <Link href="/es">Inicio</Link> / Hágase Distribuidor
      </nav>
      <h1 className="mt-2 text-2xl font-black">Hágase Distribuidor</h1>
      <ul className="mt-4 max-w-xl list-disc space-y-1 pl-5 text-sm text-slate-700">
        {ES_COPY.dealerBenefits.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
      <p className="mt-3 max-w-xl text-sm text-slate-600">
        ¿Preguntas antes de aplicar? Llame al <a href={`tel:${brand.phone}`} className="font-bold">{brand.phoneDisplay}</a>
        {brand.contactEmail && (
          <> o escriba a <a href={`mailto:${brand.contactEmail}`} className="font-bold text-brand-dark">{brand.contactEmail}</a></>
        )}. Atendemos en español.
      </p>
      <DealerForm es />
    </div>
  );
}
