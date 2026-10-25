/**
 * Which Lead rows the manager-facing lead lists (/pipeline, /leads) show when
 * a bulk importer has dropped thousands of unworked rows into the same table
 * (dealer-list activation spec sections 2.4 and 7, final-review finding F1).
 *
 * Both pages page through "newest N rows", so an import of 5,002 leads pushed
 * every pre-import lead past the row cap and off the page. The fix is a
 * "Hide imported list" control that defaults to ON: the import is something a
 * manager opts into seeing, never something that arrives on top of the daily
 * drip. This file is the one predicate both pages share.
 *
 * What counts as "an imported list": a batch whose leads carry the importer's
 * `meta.importSource` marker. Nothing here names a particular scrape, so the
 * next brand's import is covered with no code change. Lead.source cannot do
 * this job: dealer rows share PROSPECTING with the daily cron, and a new enum
 * value would be a production migration.
 *
 * What is hidden: imported rows that nobody has touched (batch is marked, no rep
 * has claimed it, stage still NEW_LEAD). A claimed or advanced lead is a rep's
 * live work and stays visible, which also keeps a rep's own pipeline whole.
 *
 * Why a batch-id list and not a `meta` path filter: Prisma cannot express "the
 * path is absent OR differs". `NOT { meta: { path, equals } }` compiles to a SQL
 * NOT over NULL, which drops every row whose meta lacks the key (measured on
 * production: 0 of 223 non-imported leads survive it). A column filter on
 * importBatchId has no such hole, as long as NULL is handled explicitly below.
 *
 * Pure and import-free on purpose: reachable from app code, so it must stay free
 * of Prisma / fs / xlsx (a value import of those from anything a client
 * component reaches passes the build and crashes production at runtime).
 */

/** Query-string parameter of the control. Absent (the default) = imported rows hidden. */
export const SHOW_IMPORTED_PARAM = "imports";

/** Only the exact value "show" turns the imported rows on. Anything else, including a repeated param, hides them. */
export function showImportedFrom(raw: unknown): boolean {
  return raw === "show";
}

/**
 * Prisma `where` that finds the batches holding importer-marked leads. Run it
 * through `lead.groupBy({ by: ["importBatchId"], where: IMPORTED_BATCH_MARKER_FILTER })`.
 * `string_contains: ""` matches any string value at the path and nothing when the
 * key is missing, so it keys on the marker's presence, not on one import's value.
 */
export const IMPORTED_BATCH_MARKER_FILTER = {
  importBatchId: { not: null },
  meta: { path: ["importSource"], string_contains: "" },
} as const;

/** Rows a manager has not claimed or advanced. Typed with the literal so it stays assignable to Prisma's enum filter. */
type Untouched = { importBatchId: { in: string[] }; assignedRepId: null; stage: "NEW_LEAD" };

type Visible = {
  AND: [
    {
      OR: [
        { importBatchId: null },
        { importBatchId: { notIn: string[] } },
        { assignedRepId: { not: null } },
        { stage: { not: "NEW_LEAD" } },
      ];
    },
  ];
};

/**
 * The fragment to merge into a lead list's `where`. `{}` when imports are shown
 * or when there are no marked batches. Sits under `AND` so it never collides with
 * a page's own `OR` (the /leads search box).
 *
 * The first branch (`importBatchId: null`) is load-bearing: `notIn` alone is
 * false for a NULL column, which would hide every lead that has no batch.
 */
export function visibleImportsWhere(input: { importedBatchIds: readonly string[]; showImported: boolean }): Visible | Record<string, never> {
  if (input.showImported || input.importedBatchIds.length === 0) return {};
  return {
    AND: [
      {
        OR: [
          { importBatchId: null },
          { importBatchId: { notIn: [...input.importedBatchIds] } },
          { assignedRepId: { not: null } },
          { stage: { not: "NEW_LEAD" } },
        ],
      },
    ],
  };
}

/** The rows `visibleImportsWhere` hides, for the "N hidden" count. Null when there is nothing to hide. */
export function unclaimedImportsWhere(importedBatchIds: readonly string[]): Untouched | null {
  if (importedBatchIds.length === 0) return null;
  return { importBatchId: { in: [...importedBatchIds] }, assignedRepId: null, stage: "NEW_LEAD" };
}

/**
 * `where` for the "N hidden" count: the hidden rows WITHIN the caller's own scope. The scope is nested under
 * AND, never spread: `{ ...scope, ...hidden }` would let the hidden predicate's `assignedRepId` / `stage`
 * overwrite the caller's own (a rep's scope, a ?rep= or ?stage= filter), and the count would drift to a
 * location-wide figure. Null when there are no marked batches.
 */
export function hiddenImportsCountWhere<S extends object>(scope: S, importedBatchIds: readonly string[]): { AND: [S, Untouched] } | null {
  const hidden = unclaimedImportsWhere(importedBatchIds);
  return hidden ? { AND: [scope, hidden] } : null;
}
