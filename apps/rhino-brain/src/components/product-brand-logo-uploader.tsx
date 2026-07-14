"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { uploadProductBrandLogo, removeProductBrandLogo } from "@/actions/website-brand";
import { useToast } from "@/components/ui/toast";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
      {pending ? "Uploading…" : "Upload"}
    </button>
  );
}

/** One row of the product-brand logo table (Grandforce, Miletrip …). */
export function ProductBrandLogoRow({ name, logoUrl, productCount }: { name: string; logoUrl: string | null; productCount: number }) {
  const [state, action] = useFormState(uploadProductBrandLogo, {} as { ok?: boolean; error?: string });
  const toast = useToast();
  const router = useRouter();

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 py-3">
      <div className="w-36 shrink-0">
        <div className="text-sm font-bold text-slate-700">{name}</div>
        <div className="text-[11px] text-slate-400">{productCount} product{productCount === 1 ? "" : "s"}</div>
      </div>
      {logoUrl ? (
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl} alt={name} className="h-10 w-auto max-w-[160px] rounded border border-slate-200 bg-white object-contain p-1" />
          <button
            type="button"
            className="text-xs font-semibold text-red-600 hover:underline"
            onClick={async () => {
              const r = await removeProductBrandLogo(name);
              if (r.ok) { toast("Logo removed — the brand shows as text"); router.refresh(); }
              else toast(r.error ?? "Failed", "error");
            }}
          >
            Remove
          </button>
        </div>
      ) : (
        <span className="text-xs text-slate-400">no logo — shows as text</span>
      )}
      <form action={action} className="ml-auto flex items-center gap-2">
        <input type="hidden" name="brandName" value={name} />
        <input type="file" name="file" required accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="block max-w-[210px] text-xs text-slate-600 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold" />
        <Submit />
      </form>
      {state.error && <p className="w-full text-xs font-semibold text-red-600">{state.error}</p>}
      {state.ok && <p className="w-full text-xs font-semibold text-emerald-700">Uploaded! The website updates within ~5 minutes.</p>}
    </div>
  );
}
