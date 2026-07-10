"use client";

import { useState, useTransition } from "react";
import { useFormState } from "react-dom";
import { uploadProductPhoto, clearProductPhoto } from "@/actions/products";
import { useToast } from "@/components/ui/toast";

export function ProductImageCell({ productId, imageUrl, storageReady }: {
  productId: string; imageUrl: string | null; storageReady: boolean;
}) {
  const [url, setUrl] = useState(imageUrl);
  const [state, action] = useFormState(uploadProductPhoto, null);
  const [pending, start] = useTransition();
  const toast = useToast();

  // reflect upload result
  if (state?.ok && state.url && state.url !== url) setUrl(state.url);
  if (state?.error) { toast(state.error, "error"); state.error = undefined; }

  if (!storageReady) return <span className="text-xs text-slate-300">—</span>;

  return (
    <div className="flex items-center gap-1.5">
      {url
        /* eslint-disable-next-line @next/next/no-img-element */
        ? <img src={url} alt="" className="h-9 w-9 rounded border border-slate-200 object-cover" />
        : <div className="flex h-9 w-9 items-center justify-center rounded border border-dashed border-slate-300 text-xs text-slate-300">🛞</div>}
      <form action={action}>
        <input type="hidden" name="productId" value={productId} />
        <label className="cursor-pointer text-xs text-brand-600 hover:underline">
          {url ? "change" : "add"}
          <input type="file" name="file" accept="image/*" className="hidden"
            onChange={e => { if (e.target.form && e.target.files?.length) e.target.form.requestSubmit(); }} />
        </label>
      </form>
      {url && (
        <button type="button" className="text-xs text-red-400 hover:underline" disabled={pending}
          onClick={() => start(async () => { await clearProductPhoto(productId); setUrl(null); toast("Photo removed"); })}>
          ✕
        </button>
      )}
    </div>
  );
}
