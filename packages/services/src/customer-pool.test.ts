import { describe, expect, it } from "vitest";
import {
  CLAIM_CAP_PER_7_DAYS,
  claimCapError,
  decidePool,
  hasProtectingQuote,
  isClaimable,
  MIN_WARNING_DAYS,
  RECYCLE_AFTER_DAYS,
  WARN_AFTER_DAYS,
  type PoolCustomer,
  type ProtectingQuote,
} from "./customer-pool";

const NOW = new Date("2026-10-26T12:00:00.000Z");
/** n days from NOW; negative is the past. */
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

const unassigned = (p: Partial<PoolCustomer> = {}): PoolCustomer => ({
  id: "cus_1",
  assignedRepId: null,
  locationId: "loc_fl",
  status: "ACTIVE",
  poolExempt: false,
  assignedAt: null,
  lastContactAt: null,
  lastSaleAt: null,
  poolWarnedAt: null,
  nextFollowUpAt: null,
  repRole: null,
  repActive: null,
  protectingQuote: false,
  ...p,
});

const held = (p: Partial<PoolCustomer> = {}): PoolCustomer =>
  unassigned({ assignedRepId: "rep_1", repRole: "SALES_REP", repActive: true, ...p });

describe("decidePool — the clock", () => {
  // Review Focus 1
  it("does not recycle an account claimed today whose last contact was a year ago", () => {
    const d = decidePool(held({ assignedAt: day(0), lastContactAt: day(-365) }), day(0));
    expect(d.state).toBe("HELD_OK");
    expect(d.clockFrom).toEqual(day(0));
  });

  it("runs the clock from the latest of assignedAt, lastContactAt and lastSaleAt", () => {
    expect(
      decidePool(held({ assignedAt: day(-200), lastContactAt: day(-100), lastSaleAt: day(-10) }), day(0)).clockFrom,
    ).toEqual(day(-10));
  });

  it("protects an account whose only recent evidence is a sale", () => {
    expect(decidePool(held({ lastContactAt: day(-200), lastSaleAt: day(-5) }), day(0)).state).toBe("HELD_OK");
  });

  it("is HELD_OK with nothing to date it, because neglect cannot be proven", () => {
    expect(decidePool(held({}), day(0)).state).toBe("HELD_OK");
  });
});

describe("decidePool — 90 days, warned for 15", () => {
  it("is HELD_OK before day 75", () => {
    expect(decidePool(held({ lastContactAt: day(-74) }), day(0)).state).toBe("HELD_OK");
  });

  it("is HELD_WARNING from day 75", () => {
    expect(decidePool(held({ lastContactAt: day(-75) }), day(0)).state).toBe("HELD_WARNING");
  });

  it("reports days left during the warning window", () => {
    expect(decidePool(held({ lastContactAt: day(-80) }), day(0)).daysLeft).toBe(10);
  });

  it("will not recycle at day 90 when the warning was never recorded", () => {
    expect(decidePool(held({ lastContactAt: day(-90), poolWarnedAt: null }), day(0)).state).toBe("HELD_WARNING");
  });

  it("will not recycle when the warning is younger than 15 days", () => {
    expect(decidePool(held({ lastContactAt: day(-90), poolWarnedAt: day(-14) }), day(0)).state).toBe("HELD_WARNING");
  });

  it("recycles at day 90 once the warning is 15 days old", () => {
    expect(decidePool(held({ lastContactAt: day(-90), poolWarnedAt: day(-15) }), day(0)).state).toBe("HELD_RECYCLE");
  });

  // Review Focus 4: the sweep is idempotent because decidePool is a pure function of stored state.
  it("returns the same state when asked twice about an already-stamped customer", () => {
    const c = held({ lastContactAt: day(-80), poolWarnedAt: day(-5) });
    expect(decidePool(c, day(0)).state).toBe(decidePool(c, day(0)).state);
    expect(c.poolWarnedAt).toEqual(day(-5));
  });
});

describe("decidePool — protections", () => {
  it("protects an account with a follow-up inside 30 days", () => {
    expect(
      decidePool(held({ lastContactAt: day(-120), poolWarnedAt: day(-20), nextFollowUpAt: day(29) }), day(0)).state,
    ).toBe("HELD_OK");
  });

  // Review Focus 5
  it("does NOT protect an account whose follow-up is parked beyond 30 days", () => {
    expect(
      decidePool(held({ lastContactAt: day(-120), poolWarnedAt: day(-20), nextFollowUpAt: day(400) }), day(0)).state,
    ).toBe("HELD_RECYCLE");
  });

  it("does NOT protect an account whose follow-up has already passed", () => {
    expect(
      decidePool(held({ lastContactAt: day(-120), poolWarnedAt: day(-20), nextFollowUpAt: day(-3) }), day(0)).state,
    ).toBe("HELD_RECYCLE");
  });

  it("protects an account with a live quote", () => {
    expect(
      decidePool(held({ lastContactAt: day(-120), poolWarnedAt: day(-20), protectingQuote: true }), day(0)).state,
    ).toBe("HELD_OK");
  });

  it("never recycles a poolExempt account", () => {
    expect(
      decidePool(held({ lastContactAt: day(-400), poolWarnedAt: day(-100), poolExempt: true }), day(0)).state,
    ).toBe("HELD_OK");
  });

  it.each(["MANAGER", "ADMIN"])("never recycles a %s-held account", repRole => {
    expect(decidePool(held({ repRole, lastContactAt: day(-400), poolWarnedAt: day(-100) }), day(0)).state).toBe(
      "HELD_OK",
    );
  });

  it("pools a deactivated rep's account immediately, with no warning wait", () => {
    expect(decidePool(held({ repActive: false, lastContactAt: day(-1) }), day(0)).state).toBe("HELD_RECYCLE");
  });

  it("does not pool a deactivated manager's account", () => {
    expect(decidePool(held({ repRole: "MANAGER", repActive: false, lastContactAt: day(-1) }), day(0)).state).toBe(
      "HELD_OK",
    );
  });
});

describe("decidePool — pool membership", () => {
  // Review Focus 2
  it("is NOT_POOLABLE when locationId is null", () => {
    expect(decidePool(unassigned({ locationId: null }), day(0)).state).toBe("NOT_POOLABLE");
  });

  it.each(["LOST", "DO_NOT_CONTACT"])("is NOT_POOLABLE when status is %s", status => {
    expect(decidePool(unassigned({ status }), day(0)).state).toBe("NOT_POOLABLE");
  });

  it("is NOT_POOLABLE when unassigned but poolExempt", () => {
    expect(decidePool(unassigned({ poolExempt: true }), day(0)).state).toBe("NOT_POOLABLE");
  });

  it("pools an INACTIVE unassigned customer", () => {
    expect(decidePool(unassigned({ status: "INACTIVE" }), day(0)).state).toBe("IN_POOL");
  });

  it("pools an ordinary unassigned customer", () => {
    expect(decidePool(unassigned(), day(0)).state).toBe("IN_POOL");
  });

  it("isClaimable only for IN_POOL", () => {
    expect(isClaimable(unassigned())).toBe(true);
    expect(isClaimable(unassigned({ locationId: null }))).toBe(false);
    expect(isClaimable(unassigned({ status: "LOST" }))).toBe(false);
    expect(isClaimable(held())).toBe(false);
  });
});

describe("claimCapError", () => {
  it("allows the 10th claim in 7 days and refuses the 11th", () => {
    expect(claimCapError(CLAIM_CAP_PER_7_DAYS - 1, "SALES_REP")).toBeNull();
    expect(claimCapError(CLAIM_CAP_PER_7_DAYS, "SALES_REP")).toMatch(/10/);
  });

  it.each(["MANAGER", "ADMIN"])("does not cap a %s", role => {
    expect(claimCapError(50, role)).toBeNull();
  });
});

describe("hasProtectingQuote", () => {
  const quote = (p: Partial<ProtectingQuote>): ProtectingQuote => ({
    status: "SENT",
    expirationDate: null,
    quoteDate: day(-200),
    decidedAt: null,
    ...p,
  });

  it("protects on a sent quote that has not expired", () => {
    expect(hasProtectingQuote([quote({ expirationDate: day(10) })], day(0))).toBe(true);
  });

  it("protects on a recently sent quote with no expiry date", () => {
    expect(hasProtectingQuote([quote({ quoteDate: day(-20) })], day(0))).toBe(true);
  });

  // the loophole the design names: a SENT quote with no expiry must not protect forever
  it("does NOT protect on an old sent quote with no expiry date", () => {
    expect(hasProtectingQuote([quote({ quoteDate: day(-200) })], day(0))).toBe(false);
  });

  it("does NOT protect on a sent quote whose expiry has passed", () => {
    expect(hasProtectingQuote([quote({ expirationDate: day(-1) })], day(0))).toBe(false);
  });

  it("protects on a quote accepted within 90 days", () => {
    expect(hasProtectingQuote([quote({ status: "ACCEPTED", decidedAt: day(-89) })], day(0))).toBe(true);
  });

  it("does NOT protect on a quote accepted more than 90 days ago", () => {
    expect(hasProtectingQuote([quote({ status: "ACCEPTED", decidedAt: day(-91) })], day(0))).toBe(false);
  });

  it.each(["DRAFT", "REJECTED", "EXPIRED"])("does NOT protect on a %s quote, however recent", status => {
    expect(hasProtectingQuote([quote({ status, quoteDate: day(-1), expirationDate: day(30) })], day(0))).toBe(false);
  });

  it("is false for no quotes at all", () => {
    expect(hasProtectingQuote([], day(0))).toBe(false);
  });

  it("protects when any one quote in the list protects", () => {
    expect(hasProtectingQuote([quote({}), quote({ expirationDate: day(5) })], day(0))).toBe(true);
  });
});

describe("constants match the spec", () => {
  it("uses 90 / 75 / 15 / 10", () => {
    expect(RECYCLE_AFTER_DAYS).toBe(90);
    expect(WARN_AFTER_DAYS).toBe(75);
    expect(MIN_WARNING_DAYS).toBe(15);
    expect(CLAIM_CAP_PER_7_DAYS).toBe(10);
  });
});
