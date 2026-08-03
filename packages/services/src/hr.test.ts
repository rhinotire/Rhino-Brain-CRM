import { describe, expect, it } from "vitest";
import {
  docExpiryStatus, worstExpiryStatus,
  canDownloadEmployeeDoc, canDeleteEmployeeDoc, coreDocsOnFile,
} from "./hr";

const NOW = new Date("2026-08-01T12:00:00Z");
const days = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);

describe("docExpiryStatus", () => {
  it("null / undefined never expires", () => {
    expect(docExpiryStatus(null, NOW)).toBe("ok");
    expect(docExpiryStatus(undefined, NOW)).toBe("ok");
  });
  it("past date is expired", () => {
    expect(docExpiryStatus(days(-1), NOW)).toBe("expired");
  });
  it("within 30 days is expiring", () => {
    expect(docExpiryStatus(days(1), NOW)).toBe("expiring");
    expect(docExpiryStatus(days(30), NOW)).toBe("expiring");
  });
  it("beyond 30 days is ok", () => {
    expect(docExpiryStatus(days(31), NOW)).toBe("ok");
  });
});

describe("worstExpiryStatus", () => {
  it("empty list is ok", () => {
    expect(worstExpiryStatus([], NOW)).toBe("ok");
  });
  it("expired beats expiring", () => {
    expect(worstExpiryStatus([days(40), days(10), days(-2)], NOW)).toBe("expired");
  });
  it("expiring beats ok", () => {
    expect(worstExpiryStatus([days(40), days(10), null], NOW)).toBe("expiring");
  });
});

describe("employee doc permissions", () => {
  it("non-sensitive: admin + manager can download, others cannot", () => {
    expect(canDownloadEmployeeDoc("ADMIN", false)).toBe(true);
    expect(canDownloadEmployeeDoc("MANAGER", false)).toBe(true);
    expect(canDownloadEmployeeDoc("SALES_REP", false)).toBe(false);
    expect(canDownloadEmployeeDoc("ACCOUNTING", false)).toBe(false);
  });
  it("sensitive: ADMIN only", () => {
    expect(canDownloadEmployeeDoc("ADMIN", true)).toBe(true);
    expect(canDownloadEmployeeDoc("MANAGER", true)).toBe(false);
  });
  it("delete: ADMIN only", () => {
    expect(canDeleteEmployeeDoc("ADMIN")).toBe(true);
    expect(canDeleteEmployeeDoc("MANAGER")).toBe(false);
  });
});

describe("coreDocsOnFile", () => {
  const CORE = ["APPLICATION", "W4_FORM"] as const;
  it("counts distinct core types, ignoring non-core and expired", () => {
    expect(coreDocsOnFile([
      { type: "APPLICATION", expiresAt: null },
      { type: "APPLICATION", expiresAt: null },       // duplicate type counts once
      { type: "OTHER", expiresAt: null },             // not core
      { type: "W4_FORM", expiresAt: days(-1) },       // expired copy doesn't count
    ], CORE, NOW)).toBe(1);
  });
  it("an unexpired copy of an otherwise-expired type still counts", () => {
    expect(coreDocsOnFile([
      { type: "W4_FORM", expiresAt: days(-1) },
      { type: "W4_FORM", expiresAt: null },
    ], CORE, NOW)).toBe(1);
  });
});
