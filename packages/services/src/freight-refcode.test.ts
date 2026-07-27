import { describe, expect, it } from "vitest";
import { refCodePrefix, nextRefCode } from "./freight-refcode";

describe("refCodePrefix", () => {
  it("builds RT-YYMM- from a date", () => {
    expect(refCodePrefix(new Date("2026-07-25T12:00:00Z"))).toBe("RT-2607-");
    expect(refCodePrefix(new Date("2026-01-05T12:00:00Z"))).toBe("RT-2601-");
  });
});

describe("nextRefCode", () => {
  it("starts at 001 for a fresh month", () => {
    expect(nextRefCode("RT-2607-", null)).toBe("RT-2607-001");
  });
  it("increments the latest", () => {
    expect(nextRefCode("RT-2607-", "RT-2607-007")).toBe("RT-2607-008");
  });
  it("crosses 099 -> 100 without padding bugs", () => {
    expect(nextRefCode("RT-2607-", "RT-2607-099")).toBe("RT-2607-100");
  });
});
