import { describe, it, expect } from "vitest";
import { CALIBRATION_QUEUE_GATE, repAssignBlockReason, repAssignmentError } from "./prospect-calibration";

type Row = { pool: string | null; score: number | null };

/** Evaluates the one operator the gate uses: `{ pool: { not: null } }`. */
const inQueue = (r: Row) => {
  const gate = CALIBRATION_QUEUE_GATE as { pool: { not: null } };
  return gate.pool.not === null ? r.pool !== null : r.pool !== gate.pool.not;
};

describe("CALIBRATION_QUEUE_GATE", () => {
  it("keeps out an imported dealer that was never graded (no pool): not a calibration candidate", () => {
    expect(inQueue({ pool: null, score: null })).toBe(false);
  });

  it("keeps in an enriched dealer lead, which carries the AI grade the queue exists for", () => {
    expect(inQueue({ pool: "B_PROJECT", score: 62 })).toBe(true);
  });

  it("keeps in a legacy prospect that has a pool but no score (the 26 pre-import rows)", () => {
    expect(inQueue({ pool: "C_CHANNEL", score: null })).toBe(true);
  });
});

describe("repAssignBlockReason", () => {
  it("blocks a lead with no location, and says why", () => {
    const reason = repAssignBlockReason({ locationId: null });
    expect(reason).toMatch(/no company location/i);
    expect(reason).toMatch(/cannot be assigned/i);
  });

  it("does not block a lead that belongs to a company", () => {
    expect(repAssignBlockReason({ locationId: "loc_fl" })).toBeNull();
  });

  it("treats an empty-string location as no location (a falsy id must not slip through)", () => {
    expect(repAssignBlockReason({ locationId: "" })).not.toBeNull();
  });
});

describe("repAssignmentError (the guard every action that puts a rep on a lead calls)", () => {
  it("refuses to give a rep a lead with no company location, with the reason", () => {
    expect(repAssignmentError({ locationId: null }, "rep_1")).toBe(repAssignBlockReason({ locationId: null }));
    expect(repAssignmentError({ locationId: null }, "rep_1")).toMatch(/cannot be assigned/i);
  });

  it("allows a lead that belongs to a company", () => {
    expect(repAssignmentError({ locationId: "loc_fl" }, "rep_1")).toBeNull();
  });

  it("does not block clearing an assignment: no rep is being assigned (empty id, null, undefined)", () => {
    for (const none of ["", null, undefined]) expect(repAssignmentError({ locationId: null }, none)).toBeNull();
  });
});
