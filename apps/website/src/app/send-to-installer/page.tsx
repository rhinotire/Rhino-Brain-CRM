import type { Metadata } from "next";
import Link from "next/link";
import { PublicCatalogService, recordEvent } from "@rhino/services";
import { SendToInstallerForm } from "@/components/send-to-installer-form";
import { BRAND_KEY } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Send This Tire to My Installer",
  description:
    "Already have a trusted tire shop? Send them this product request and we'll help them source it for you at wholesale.",
  alternates: { canonical: "/send-to-installer" },
};

export const dynamic = "force-dynamic";

export default async function SendToInstallerPage({ searchParams }: { searchParams: { product?: string; size?: string } }) {
  let productLabel: string | undefined;
  let productId: string | undefined;
  if (searchParams.product) {
    const p = await PublicCatalogService.getBySlug(searchParams.product, BRAND_KEY);
    if (p) {
      productId = p.id;
      productLabel = `${p.name} (SKU ${p.sku})`;
    }
  }
  await recordEvent("send_to_installer_viewed", { brandKey: BRAND_KEY, productId });

  return (
    <div className="pt-8">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
        <Link href="/">Home</Link> / Send to My Installer
      </nav>
      <h1 className="mt-2 text-2xl font-black">Send This Tire to My Installer</h1>
      <p className="mt-2 max-w-xl text-sm text-slate-600">
        Already have a trusted tire shop? Tell us who they are — we&apos;ll send them your request and help them source
        the product for you. You&apos;ll get a tracking link and updates at every step.
      </p>
      <SendToInstallerForm productId={productId} productLabel={productLabel} tireSize={searchParams.size} />
    </div>
  );
}
