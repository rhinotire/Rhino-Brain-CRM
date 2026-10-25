import { describe, it, expect } from "vitest";
import {
  visibleImportsWhere,
  unclaimedImportsWhere,
  hiddenImportsCountWhere,
  showImportedFrom,
  IMPORTED_BATCH_MARKER_FILTER,
} from "./lead-import-visibility";

/**
 * A deliberately small interpreter for exactly the Prisma operators the helper
 * emits, with SQL's NULL behaviour where it matters: `NOT IN` against a NULL
 * column is NULL, i.e. the row is DROPPED. That is the trap this helper is built
 * around (a plain `importBatchId: { notIn }` silently hides every lead that has
 * no batch at all), so the tests must be able to see it.
 */
type Row = { importBatchId: string | null; assignedRepId: string | null; stage: string };
type Cond = Record<string, unknown>;

function matchesField(value: unknown, cond: unknown): boolean {
  if (cond === null) return value === null;
  if (typeof cond === "string") return value === cond;
  const c = cond as { in?: unknown[]; notIn?: unknown[]; not?: unknown };
  if (c.in) return value !== null && c.in.includes(value);
  if (c.notIn) return value !== null && !c.notIn.includes(value); // SQL: NULL NOT IN (...) is not true
  if ("not" in c) return c.not === null ? value !== null : value !== null && value !== c.not;
  throw new Error(`interpreter does not know ${JSON.stringify(cond)}`);
}

function matches(row: Row, where: Cond): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === "AND") return (cond as Cond[]).every((w) => matches(row, w));
    if (key === "OR") return (cond as Cond[]).some((w) => matches(row, w));
    return matchesField((row as unknown as Record<string, unknown>)[key], cond);
  });
}

const DEALER = "batch_dealer";
const DEALER_2 = "batch_next_brand";
const CSV = "batch_csv_upload"; // a Settings -> Import CSV batch: has a batch id, carries no importer marker
const IDS = [DEALER, DEALER_2];

const cronLead: Row = { importBatchId: null, assignedRepId: null, stage: "NEW_LEAD" };
const csvLead: Row = { importBatchId: CSV, assignedRepId: null, stage: "NEW_LEAD" };
const untouchedImport: Row = { importBatchId: DEALER, assignedRepId: null, stage: "NEW_LEAD" };
const claimedImport: Row = { importBatchId: DEALER, assignedRepId: "rep_1", stage: "NEW_LEAD" };
const workedImport: Row = { importBatchId: DEALER_2, assignedRepId: null, stage: "CONTACTED" };

describe("showImportedFrom", () => {
  it("is off unless the query value is exactly 'show' (hidden is the default)", () => {
    expect(showImportedFrom(undefined)).toBe(false);
    expect(showImportedFrom("")).toBe(false);
    expect(showImportedFrom("hide")).toBe(false);
    expect(showImportedFrom("SHOW")).toBe(false);
    expect(showImportedFrom(["show", "show"])).toBe(false); // a repeated param is not a string
  });
  it("is on for 'show'", () => {
    expect(showImportedFrom("show")).toBe(true);
  });
});

describe("visibleImportsWhere", () => {
  const visible = (r: Row, ids: readonly string[] = IDS) => matches(r, visibleImportsWhere({ importedBatchIds: ids, showImported: false }));

  it("hides an untouched imported lead", () => {
    expect(visible(untouchedImport)).toBe(false);
  });

  it("hides a lead from ANY marked batch, not just the first import (the next brand's scrape is covered)", () => {
    expect(visible({ ...untouchedImport, importBatchId: DEALER_2 })).toBe(false);
  });

  it("keeps a lead that has no batch at all (cron / website / hand-entered leads)", () => {
    expect(visible(cronLead)).toBe(true);
  });

  it("keeps a lead from a batch that carries no importer marker (a CSV upload from Settings)", () => {
    expect(visible(csvLead)).toBe(true);
  });

  it("keeps an imported lead a rep has claimed: it is that rep's live work", () => {
    expect(visible(claimedImport)).toBe(true);
  });

  it("keeps an imported lead that has moved past NEW_LEAD even if unclaimed", () => {
    expect(visible(workedImport)).toBe(true);
  });

  it("adds no condition when the caller asked to see imports", () => {
    expect(visibleImportsWhere({ importedBatchIds: IDS, showImported: true })).toEqual({});
  });

  it("adds no condition when there are no marked batches (nothing to hide, no empty notIn)", () => {
    expect(visibleImportsWhere({ importedBatchIds: [], showImported: false })).toEqual({});
  });

  it("nests its OR under AND so it cannot collide with a page's own OR (the leads search box)", () => {
    const w = visibleImportsWhere({ importedBatchIds: IDS, showImported: false });
    expect(Object.keys(w)).toEqual(["AND"]);
    expect({ OR: [{ companyName: "x" }], ...w }).toMatchObject({ OR: [{ companyName: "x" }] });
  });
});

describe("unclaimedImportsWhere (the hidden rows, for the 'N hidden' count)", () => {
  it("selects exactly the rows visibleImportsWhere hides, for every kind of lead", () => {
    const hiddenWhere = unclaimedImportsWhere(IDS)!;
    const visibleWhere = visibleImportsWhere({ importedBatchIds: IDS, showImported: false });
    for (const r of [cronLead, csvLead, untouchedImport, claimedImport, workedImport]) {
      expect(matches(r, hiddenWhere)).toBe(!matches(r, visibleWhere));
    }
    expect(matches(untouchedImport, hiddenWhere)).toBe(true);
  });

  it("is null when there are no marked batches (the page then skips the count)", () => {
    expect(unclaimedImportsWhere([])).toBeNull();
  });
});

describe("IMPORTED_BATCH_MARKER_FILTER", () => {
  it("keys on the presence of the importer's marker, not on one hard-coded import's value", () => {
    expect(IMPORTED_BATCH_MARKER_FILTER).toEqual({
      importBatchId: { not: null },
      meta: { path: ["importSource"], string_contains: "" },
    });
  });
});

describe("hiddenImportsCountWhere (the '(N hidden)' count, scoped to what the caller can see)", () => {
  const scopedCount = (rows: Row[], scope: Cond) => {
    const w = hiddenImportsCountWhere(scope, IDS)!;
    return rows.filter((r) => matches(r, w)).length;
  };
  const rows: Row[] = [cronLead, csvLead, untouchedImport, claimedImport, workedImport, { ...untouchedImport }];

  it("counts every hidden row for an unscoped viewer", () => {
    expect(scopedCount(rows, {})).toBe(2);
  });

  it("keeps the caller's own assignedRepId: a rep's scope (their own leads) leaves nothing hidden, since hidden rows are unclaimed", () => {
    // A plain spread would let the hidden predicate's `assignedRepId: null` overwrite this and count location-wide.
    expect(scopedCount(rows, { assignedRepId: "rep_1" })).toBe(0);
  });

  it("keeps a ?stage= filter: filtering to CONTACTED cannot report NEW_LEAD rows as hidden", () => {
    expect(scopedCount(rows, { stage: "CONTACTED" })).toBe(0);
    expect(scopedCount(rows, { stage: "NEW_LEAD" })).toBe(2);
  });

  it("keeps a ?rep= filter for a manager", () => {
    expect(scopedCount(rows, { assignedRepId: "rep_2" })).toBe(0);
  });

  it("does not mutate or reuse the caller's scope object", () => {
    const scope = { assignedRepId: "rep_1" };
    hiddenImportsCountWhere(scope, IDS);
    expect(scope).toEqual({ assignedRepId: "rep_1" });
  });

  it("is null when there are no marked batches", () => {
    expect(hiddenImportsCountWhere({ assignedRepId: "rep_1" }, [])).toBeNull();
  });
});
