import { db } from "@/lib/db";
import { IMPORTED_BATCH_MARKER_FILTER } from "@rhino/services";

/**
 * Ids of every import batch that holds importer-marked leads (Lead.meta.importSource),
 * for the "Hide imported list" control on /pipeline and /leads. One grouped read of
 * the marked rows (a few thousand at most); returns [] when nothing has been imported.
 * Keyed on the marker's presence, so a later brand's import is picked up automatically.
 * The predicate that uses these ids lives in @rhino/services (lead-import-visibility.ts).
 */
export async function listImportedBatchIds(): Promise<string[]> {
  const groups = await db.lead.groupBy({ by: ["importBatchId"], where: IMPORTED_BATCH_MARKER_FILTER });
  return groups.map(g => g.importBatchId).filter((id): id is string => id !== null);
}
