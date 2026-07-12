import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { brandAssetUrl } from "@/lib/storage";
import { BrandImageUploader } from "@/components/brand-logo-uploader";
import { Badge } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

/** Owner controls for the public websites (brand identity per company). */
export default async function WebsiteSettingsPage() {
  const session = await requireSession();
  if (session.role !== "ADMIN") redirect("/dashboard");

  const brands = await db.brandConfig.findMany({ orderBy: { key: "asc" } });

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-bold">Website Brand</h1>
      <p className="text-sm text-slate-500">
        Logo and identity shown on the public websites. Changes go live within about 5 minutes.
      </p>

      {brands.map((b) => (
        <div key={b.id} className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold">{b.name}</h2>
            <Badge className={b.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}>
              {b.active ? "LIVE" : "not launched"}
            </Badge>
            <span className="text-xs text-slate-400">{b.domain}</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {b.phoneDisplay} · {b.networkName}
          </div>
          <div className="mt-4 space-y-5">
            <div>
              <div className="text-sm font-bold text-slate-600">Header logo</div>
              <BrandImageUploader brandKey={b.key} kind="logo" imageUrl={brandAssetUrl(b.logoPath)}
                hint="PNG, JPG, WebP, or SVG · transparent background looks best" maxMb={5} />
            </div>
            <div className="border-t border-slate-100 pt-4">
              <div className="text-sm font-bold text-slate-600">Homepage banner photo</div>
              <BrandImageUploader brandKey={b.key} kind="hero" imageUrl={brandAssetUrl(b.heroImagePath)}
                hint="Wide photo works best (warehouse, tire racks, storefront) — shown behind the homepage headline with a dark overlay" maxMb={8} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
