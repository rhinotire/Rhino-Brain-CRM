import Link from "next/link";
import { sizeToSlug } from "@/lib/site";

/**
 * Collapsible size navigation for category pages. A wall of 150+ size chips
 * buried the products (owner feedback); this groups sizes by wheel diameter
 * behind native <details> — no JS, so it works even with page translators.
 */

/** "ST205/75R15" → 15, "11R22.5" → 22.5, "35X12.50R20" → 20; null when unparseable. */
function rimDiameter(size: string): number | null {
  const m = size.match(/R\s*(\d{2}(?:\.\d)?)/i) ?? size.match(/[-X](\d{2}(?:\.\d)?)$/i);
  const d = m ? Number(m[1]) : NaN;
  return Number.isFinite(d) && d >= 8 && d <= 30 ? d : null;
}

export function SizeBrowser({
  sizes,
  hrefBase,
  popular = [],
  es,
}: {
  sizes: string[];
  hrefBase: string; // e.g. "/tires/passenger" — size slug is appended
  popular?: string[];
  es?: boolean;
}) {
  if (sizes.length < 2) return null;

  const groups = new Map<string, string[]>();
  for (const s of sizes) {
    const d = rimDiameter(s);
    const key = d === null ? (es ? "Otras" : "Other") : `${d}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(s);
  }
  const ordered = [...groups.entries()].sort(([a], [b]) => {
    const na = Number(a), nb = Number(b);
    if (Number.isNaN(na)) return 1;
    if (Number.isNaN(nb)) return -1;
    return na - nb;
  });
  const chip = "rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold hover:border-brand hover:text-brand-dark";
  const popularInStock = popular.filter((p) => sizes.includes(p));

  return (
    <div className="mt-4">
      {popularInStock.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{es ? "Más vendidas:" : "Top sellers:"}</span>
          {popularInStock.map((s) => (
            <Link key={s} href={`${hrefBase}/${sizeToSlug(s)}`} className={chip}>{s}</Link>
          ))}
        </div>
      )}
      {/* compact diameter tiles, 4–5 per row; the open one stretches full width */}
      <div className="mt-3 grid grid-cols-4 gap-1.5 sm:grid-cols-5">
        {ordered.map(([dia, list]) => (
          // name= makes the accordion exclusive: opening one diameter closes the rest
          <details key={dia} name="size-groups" className="rounded-lg border border-slate-200 bg-white open:col-span-full open:border-brand">
            <summary className="cursor-pointer select-none list-none px-2 py-2 text-center text-sm font-bold text-slate-800 hover:text-brand-dark [&::-webkit-details-marker]:hidden">
              {Number.isNaN(Number(dia)) ? dia : `${dia}″`}
              <span className="block text-[10px] font-semibold leading-tight text-slate-400">
                {list.length} {es ? (list.length === 1 ? "medida" : "medidas") : list.length === 1 ? "size" : "sizes"}
              </span>
            </summary>
            <div className="flex flex-wrap gap-2 border-t border-slate-100 px-3 py-3">
              {[...list].sort((a, b) => a.localeCompare(b, "en", { numeric: true })).map((s) => (
                <Link key={s} href={`${hrefBase}/${sizeToSlug(s)}`} className={chip}>{s}</Link>
              ))}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
