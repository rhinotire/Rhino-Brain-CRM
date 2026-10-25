/**
 * The "Hide imported list" control shared by /pipeline and /leads. Plain server markup
 * inside the page's existing GET form: an unchecked box submits nothing, which the page
 * reads as "hidden" (the default); checking it submits imports=show.
 */
export function ShowImportedToggle({ checked, hiddenCount }: { checked: boolean; hiddenCount: number }) {
  return (
    <label className="flex h-9 items-center gap-1.5 text-sm text-slate-600" title="Bulk-imported dealer-list leads that nobody has claimed yet">
      <input type="checkbox" name="imports" value="show" defaultChecked={checked} />
      Show imported list
      {!checked && hiddenCount > 0 && <span className="text-xs text-slate-400">({hiddenCount.toLocaleString("en-US")} hidden)</span>}
    </label>
  );
}
