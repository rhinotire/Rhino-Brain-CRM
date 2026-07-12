"use client";

import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { uploadBrandImage, removeBrandImage } from "@/actions/website-brand";
import { useToast } from "@/components/ui/toast";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
      {pending ? "Uploading…" : label}
    </button>
  );
}

/** Owner image uploader for a brand asset (header logo or homepage hero banner). */
export function BrandImageUploader({
  brandKey,
  kind,
  imageUrl,
  hint,
  maxMb,
}: {
  brandKey: string;
  kind: "logo" | "hero";
  imageUrl: string | null;
  hint: string;
  maxMb: number;
}) {
  const [state, action] = useFormState(uploadBrandImage, {} as { ok?: boolean; error?: string });
  const toast = useToast();
  const router = useRouter();
  const preview = kind === "hero" ? "h-24 w-full max-w-md object-cover" : "h-14 w-auto max-w-[260px] object-contain p-1";

  return (
    <div>
      {imageUrl ? (
        <div className="mb-3 flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt={`${brandKey} ${kind}`} className={`${preview} rounded border border-slate-200 bg-white`} />
          <button
            type="button"
            className="text-xs font-semibold text-red-600 hover:underline"
            onClick={async () => {
              const r = await removeBrandImage(brandKey, kind);
              if (r.ok) { toast("Removed — website falls back to the default"); router.refresh(); }
              else toast(r.error ?? "Failed", "error");
            }}
          >
            Remove
          </button>
        </div>
      ) : (
        <p className="mb-3 text-sm text-slate-500">Nothing uploaded — the website uses the built-in default.</p>
      )}
      <form action={action} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="brandKey" value={brandKey} />
        <input type="hidden" name="kind" value={kind} />
        <input
          type="file"
          name="file"
          required
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="block text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-semibold"
        />
        <Submit label={kind === "hero" ? "Upload Banner Photo" : "Upload Logo"} />
      </form>
      {state.error && <p className="mt-2 text-sm font-semibold text-red-600">{state.error}</p>}
      {state.ok && <p className="mt-2 text-sm font-semibold text-emerald-700">Uploaded! The website updates within ~5 minutes.</p>}
      <p className="mt-2 text-xs text-slate-400">{hint} · max {maxMb} MB</p>
    </div>
  );
}
