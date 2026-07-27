import { describe, expect, it } from "vitest";
import {
  buildQuoteRequestEmail,
  buildConfirmationEmail,
  buildRegretEmail,
  routeSummary,
  equipmentLabel,
  type FreightEmailInput,
} from "./freight-email-templates";

const base: FreightEmailInput = {
  refCode: "RT-2607-001",
  originAddress: "11423 Satellite Blvd, Orlando, FL 32837",
  originLabel: "Orlando, FL",
  equipment: "DRY_VAN_53",
  pickupDateISO: "2026-07-28",
  commodity: "tires",
  stops: [
    { sequence: 1, name: "Pearson GA – ABC Tire", addressLine: "100 Main St", city: "Pearson", state: "GA", zip: "31642", contactName: "Joe", phone: "912-555-0100", quantity: "250 tires" },
    { sequence: 2, name: "Douglas GA – XYZ Tire", addressLine: "200 Oak Ave", city: "Douglas", state: "GA", zip: "31533", quantity: "180 tires" },
  ],
};

describe("routeSummary / equipmentLabel", () => {
  it("multi-stop summary lists cities with stop count", () => {
    expect(routeSummary(base)).toBe("Orlando, FL -> Pearson GA + Douglas GA (2 stops)");
  });
  it("single stop omits the count", () => {
    expect(routeSummary({ ...base, stops: [base.stops[0]] })).toBe("Orlando, FL -> Pearson GA");
  });
  it("labels equipment", () => {
    expect(equipmentLabel("FLATBED_53")).toBe("53' Flatbed");
  });
});

describe("buildQuoteRequestEmail", () => {
  it("subject carries refCode, route, equipment", () => {
    const { subject } = buildQuoteRequestEmail(base);
    expect(subject).toBe("Rate Request RT-2607-001: Orlando, FL -> Pearson GA + Douglas GA (2 stops), 53' Dry Van");
  });
  it("body lists stops in order with addresses and quantities, asks for all-in rate", () => {
    const { body } = buildQuoteRequestEmail(base);
    const iStop1 = body.indexOf("Stop 1");
    const iStop2 = body.indexOf("Stop 2");
    expect(iStop1).toBeGreaterThan(-1);
    expect(iStop2).toBeGreaterThan(iStop1);
    expect(body).toContain("100 Main St, Pearson, GA 31642");
    expect(body).toContain("250 tires");
    expect(body).toContain("all-in rate");
    expect(body).toContain("drop fees");
  });
});

describe("buildConfirmationEmail", () => {
  it("contains price, pickup date, and every stop", () => {
    const { subject, body } = buildConfirmationEmail(base, { carrierName: "TMS Transportation", price: 2450 });
    expect(subject).toContain("RT-2607-001");
    expect(body).toContain("$2,450.00");
    expect(body).toContain("2026-07-28");
    expect(body).toContain("Douglas");
  });
});

describe("buildRegretEmail", () => {
  it("references the refCode and says covered", () => {
    const { body } = buildRegretEmail(base, "TMS Transportation");
    expect(body).toContain("RT-2607-001");
    expect(body.toLowerCase()).toContain("covered");
  });
});
