"use client";

import { useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { uploadBrandLogo, removeBrandLogo } from "@/actions/website-brand";
import { useToast } from "@/components/ui/toast";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
      {pending ? "Uploading…" : "Upload Logo"}
    </button>
  );
}

export function BrandLogoUploader({ brandKey, logoUrl }: { brandKey: string; logoUrl: string | null }) {
  const [state, action] = useFormState(uploadBrandLogo, {} as { ok?: boolean; error?: string });
  const fileRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const router = useRouter();

  return (
    <div>
      {logoUrl ? (
        <div className="mb-3 flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl} alt={`${brandKey} logo`} className="h-14 w-auto max-w-[260px] rounded border border-slate-200 bg-white object-contain p-1" />
          <button
            type="button"
            className="text-xs font-semibold text-red-600 hover:underline"
            onClick={async () => {
              const r = await removeBrandLogo(brandKey);
              if (r.ok) { toast("Logo removed — website falls back to the default"); router.refresh(); }
              else toast(r.error ?? "Failed", "error");
            }}
          >
            Remove
          </button>
        </div>
      ) : (
        <p className="mb-3 text-sm text-slate-500">No logo uploaded — the website shows the built-in default.</p>
      )}
      <form action={action} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="brandKey" value={brandKey} />
        <input
          ref={fileRef}
          type="file"
          name="file"
          required
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="block text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-semibold"
        />
        <Submit />
      </form>
      {state.error && <p className="mt-2 text-sm font-semibold text-red-600">{state.error}</p>}
      {state.ok && <p className="mt-2 text-sm font-semibold text-emerald-700">Uploaded! The website updates within ~5 minutes.</p>}
      <p className="mt-2 text-xs text-slate-400">PNG, JPG, WebP, or SVG · max 5 MB · transparent background looks best in the header.</p>
    </div>
  );
}
