import type { Metadata } from "next";
import Link from "next/link";
import { PublicInstallerService, recordEvent } from "@rhino/services";
import { InstallerCard } from "@/components/installer-cards";
import { InstallerNeededForm } from "@/components/consumer-request-form";
import { getBrand, BRAND_KEY } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Find Tires & Installation Near Me",
  description:
    "Enter your tire size and ZIP code to find local professional installation. Orlando-area customers install at IDEAL TIRES & WHEELS.",
  alternates: { canonical: "/find-installation" },
};

export const dynamic = "force-dynamic"; // results depend on ?zip=

type Search = { zip?: string; size?: string; product?: string };

export default async function FindInstallationPage({ searchParams }: { searchParams: Search }) {
  const brand = await getBrand();
  const zip = searchParams.zip?.trim() ?? "";
  const size = searchParams.size?.trim();
  const productId = searchParams.product?.trim();

  const options = zip
    ? await PublicInstallerService.findOptions({ zip, brandKey: BRAND_KEY, productId: productId || undefined })
    : null;

  if (zip && options) {
    await recordEvent("installation_search_completed", { brandKey: BRAND_KEY, zip, productId });
    if (options.kind === "IDEAL") await recordEvent("ideal_match_found", { brandKey: BRAND_KEY, zip, productId });
    if (options.kind === "PARTNERS") await recordEvent("partner_installer_match_found", { brandKey: BRAND_KEY, zip, productId });
    if (options.kind === "NONE") await recordEvent("installer_match_not_found", { brandKey: BRAND_KEY, zip, productId });
  }

  return (
    <div className="pt-8">
      <nav aria-label="Breadcrumb" className="text-xs text-slate-500">
        <Link href="/">Home</Link> / Find Installation
      </nav>
      <h1 className="mt-2 text-2xl font-black">Find Tires &amp; Installation Near You</h1>
      <p className="mt-2 max-w-2xl text-sm text-slate-600">
        Enter your ZIP code and we&apos;ll show local installation options from the {brand.networkName}.
      </p>

      <form action="/find-installation" method="get" className="mt-5 flex max-w-xl flex-wrap gap-2">
        <div className="min-w-[9rem] flex-1">
          <label htmlFor="fi-size" className="sr-only">Tire size</label>
          <input id="fi-size" name="size" defaultValue={size} placeholder="Tire size (optional)" className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm" />
        </div>
        <div className="w-32">
          <label htmlFor="fi-zip" className="sr-only">ZIP code</label>
          <input id="fi-zip" name="zip" defaultValue={zip} required pattern="\d{5}" inputMode="numeric" placeholder="ZIP code" className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm" />
        </div>
        {productId && <input type="hidden" name="product" value={productId} />}
        <button className="rounded-lg bg-brand px-5 py-3 text-sm font-bold text-ink">Find Local Options</button>
      </form>

      <div className="mt-8 max-w-2xl">
        {options?.kind === "INVALID_ZIP" && (
          <p className="rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">
            That doesn&apos;t look like a valid US ZIP code — please check it and try again.
          </p>
        )}
        {options?.kind === "IDEAL" && (
          <InstallerCard installer={options.installer} owned productId={productId} tireSize={size} zip={zip} />
        )}
        {options?.kind === "PARTNERS" && (
          <div className="space-y-4">
            {options.installers.map((i) => (
              <InstallerCard key={i.id} installer={i} owned={false} productId={productId} tireSize={size} zip={zip} />
            ))}
          </div>
        )}
        {options?.kind === "NONE" && (
          <div className="rounded-2xl bg-slate-50 p-6">
            <h2 className="text-lg font-bold">We&apos;re locating an installer near you</h2>
            <p className="mt-1 text-sm text-slate-600">
              Tell us what you need and our team will connect you with a qualified shop in your area.
            </p>
            <InstallerNeededForm zip={zip} productId={productId} tireSize={size} />
          </div>
        )}
        {!options && (
          <p className="text-sm text-slate-500">
            Popular sizes: ST205/75R15 · ST225/75R15 · ST235/80R16 — or browse{" "}
            <Link href="/tires" className="font-bold text-brand-dark">the full catalog</Link>.
          </p>
        )}
      </div>
    </div>
  );
}
