"use client";

import { useEffect, useState } from "react";
import { getDocumentDownloadUrl } from "@/actions/documents";
import { Modal } from "@/components/ui/modal";

/**
 * A photo document shown inline as a small thumbnail that opens a full-size
 * lightbox on click — so field visit photos / business cards can be seen
 * without downloading. Either pass a ready `url` (server pre-signed, cheapest
 * when the caller already has access, e.g. the manager-only field report) or a
 * `docId` to lazily fetch a permission-checked signed URL on mount (used in
 * the customer document vault where some docs are sensitive).
 */
export function PhotoThumb({ docId, url: directUrl, fileName, className }: {
  docId?: string; url?: string; fileName: string; className?: string;
}) {
  const [url, setUrl] = useState<string | null>(directUrl ?? null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (directUrl || !docId) return;
    let active = true;
    getDocumentDownloadUrl(docId)
      .then(r => { if (active) r.url ? setUrl(r.url) : setFailed(true); })
      .catch(() => active && setFailed(true));
    return () => { active = false; };
  }, [docId, directUrl]);

  const sz = className ?? "h-11 w-11";
  if (failed) return null;
  if (!url) return <span className={`${sz} shrink-0 animate-pulse rounded border border-slate-200 bg-slate-100`} />;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title="Click to enlarge" className="shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={fileName} className={`${sz} rounded border border-slate-200 object-cover transition hover:ring-2 hover:ring-brand-400`} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={fileName}>
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={fileName} className="max-h-[75vh] w-full rounded-md object-contain" />
          <div className="flex justify-end">
            <a href={url} target="_blank" rel="noopener" className="text-sm text-brand-600 hover:underline">Open full size ↗</a>
          </div>
        </div>
      </Modal>
    </>
  );
}
