"use client";

import { useEffect, useState } from "react";

/**
 * Click-to-enlarge viewer: thumbnail 🔍 opens the full image; clicking the
 * image toggles 2.5× zoom centered on the clicked spot; Esc / backdrop closes.
 */
export function ImageLightbox({ src, alt = "", trigger = "icon", thumbClassName }: {
  src: string; alt?: string; trigger?: "icon" | "thumb"; thumbClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open]);

  useEffect(() => { if (!open) setZoom(null); }, [open]);

  return (
    <>
      {trigger === "thumb" ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={src} alt={alt} title="Click to view full image"
          onClick={() => setOpen(true)}
          className={thumbClassName ?? "h-9 w-9 cursor-zoom-in rounded border border-slate-200 object-cover"} />
      ) : (
        <button type="button" onClick={() => setOpen(true)} title="View full image"
          className="rounded border border-slate-200 bg-white px-1 text-xs text-slate-500 hover:bg-slate-50">
          🔍
        </button>
      )}
      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4" onClick={() => setOpen(false)}>
          <div className="relative max-h-full max-w-full overflow-hidden rounded-lg" onClick={e => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt}
              onClick={e => {
                if (zoom) { setZoom(null); return; }
                const r = (e.target as HTMLImageElement).getBoundingClientRect();
                setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
              }}
              style={zoom ? { transform: "scale(2.5)", transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
              className={`max-h-[85vh] max-w-[90vw] select-none object-contain transition-transform duration-200 ${zoom ? "cursor-zoom-out" : "cursor-zoom-in"}`}
            />
          </div>
          <button type="button" onClick={() => setOpen(false)}
            className="absolute right-4 top-4 rounded-full bg-white/90 px-3 py-1.5 text-sm font-semibold text-slate-800 shadow">
            ✕ Close
          </button>
          <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
            Click the image to zoom in on a spot · click again to zoom out
          </div>
        </div>
      )}
    </>
  );
}
