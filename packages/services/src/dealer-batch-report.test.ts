import { describe, expect, it } from "vitest";
import {
  CONTACT_ACTIVITY_TYPES, rollupBatch, tierLabel,
  type BatchActivity, type BatchLead, type BatchOrder, type BatchQuote,
} from "./dealer-batch-report";

const lead = (id: string, tier: unknown, over: Partial<BatchLead> = {}): BatchLead => ({
  id, meta: { importSource: "dealer-locators", tier }, stage: "NEW_LEAD",
  convertedCustomerId: null, convertedAt: null, assignedRepId: null, locationId: "loc-fl", ...over,
});
const act = (leadId: string, type: string): BatchActivity => ({ leadId, type });
const D = (s: string) => new Date(s);
const run = (leads: BatchLead[], extra: { activities?: BatchActivity[]; quotes?: BatchQuote[]; orders?: BatchOrder[] } = {}) =>
  rollupBatch({ leads, activities: extra.activities ?? [], quotes: extra.quotes ?? [], orders: extra.orders ?? [] });
const tierRow = (r: ReturnType<typeof run>, tier: number | null) => r.tiers.find((t) => t.tier === tier)!;

describe("rollupBatch: zeros", () => {
  it("an untouched batch reports the real denominator and zero everywhere else", () => {
    const r = run([lead("a", 2), lead("b", 2), lead("c", 3)]);
    expect(r.total).toMatchObject({ leads: 3, contacted: 0, quoted: 0, converted: 0, convertedValue: 0, convertedPerContacted: null });
    expect(tierRow(r, 2)).toMatchObject({ leads: 2, contacted: 0, quoted: 0, converted: 0, convertedPerContacted: null });
    expect(tierRow(r, 3).leads).toBe(1);
  });

  it("an empty batch is an empty rollup, not an error", () => {
    const r = run([]);
    expect(r.tiers).toEqual([]);
    expect(r.total.leads).toBe(0);
  });
});

describe("rollupBatch: tiers", () => {
  it("orders tiers best (lowest number) first and puts an unreadable tier last, never guessing one", () => {
    const r = run([lead("a", 4), lead("b", "2"), lead("c", 2.5), lead("d", 2), lead("e", undefined), lead("f", 3)]);
    expect(r.tiers.map((t) => t.tier)).toEqual([2, 3, 4, null]);
    expect(tierRow(r, null)).toMatchObject({ leads: 3, label: "no tier recorded (meta.tier missing or not a whole number)" });
  });

  it("reads the tier from meta even when meta is null or not an object", () => {
    const r = run([lead("a", 2, { meta: null }), lead("b", 2, { meta: [] }), lead("c", 2, { meta: "x" })]);
    expect(r.tiers.map((t) => t.tier)).toEqual([null]);
    expect(r.total.leads).toBe(3);
  });

  it("the per-tier rows always sum to the total", () => {
    const leads = [lead("a", 2), lead("b", 2), lead("c", 3), lead("d", 5), lead("e", null)];
    const r = run(leads, { activities: [act("a", "CALL"), act("c", "EMAIL")] });
    for (const k of ["leads", "contacted", "quoted", "converted", "claimed", "parked"] as const) {
      expect(r.tiers.reduce((s, t) => s + t[k], 0)).toBe(r.total[k]);
    }
  });

  it("labels the tiers so tier 1 reads as the best and larger numbers as weaker", () => {
    expect(tierLabel(2)).toMatch(/home state.*2\+ brands/i);
    expect(tierLabel(1)).toMatch(/existing customer/i);
    expect(tierLabel(8)).toMatch(/parked/i);
    expect(tierLabel(42)).toBe("tier 42 (unlabelled)");
  });
});

describe("rollupBatch: contacted", () => {
  it("counts a lead once however many contact activities it has", () => {
    const r = run([lead("a", 2)], { activities: [act("a", "CALL"), act("a", "EMAIL"), act("a", "VISIT")] });
    expect(r.total.contacted).toBe(1);
  });

  it("does not count attempts or notes: no-answer, voicemail and internal notes are not contact", () => {
    const r = run([lead("a", 2), lead("b", 2), lead("c", 2)], {
      activities: [act("a", "NO_ANSWER"), act("b", "VOICEMAIL"), act("c", "INTERNAL_NOTE")],
    });
    expect(r.total.contacted).toBe(0);
  });

  it("agrees with the app's own list of contact types", () => {
    expect([...CONTACT_ACTIVITY_TYPES].sort()).toEqual(
      ["CALL", "COMPLAINT", "EMAIL", "ORDER", "PAYMENT", "QUOTE", "TEXT", "VISIT", "WHATSAPP"],
    );
  });

  it("counts a lead the rep moved past NEW_LEAD even with no logged activity, but not a LOST one", () => {
    const r = run([
      lead("a", 2, { stage: "CONTACTED" }), lead("b", 2, { stage: "INTERESTED" }),
      lead("c", 2, { stage: "LOST" }), lead("d", 2, { stage: "NEW_LEAD" }),
    ]);
    expect(r.total.contacted).toBe(2);
  });

  it("ignores activity on leads outside the batch", () => {
    const r = run([lead("a", 2)], { activities: [act("zzz", "CALL")] });
    expect(r.total.contacted).toBe(0);
  });

  it("a quoted or converted lead is also contacted even with no contact activity", () => {
    const r = run([
      lead("a", 2, { stage: "QUOTED" }),
      lead("b", 2, { convertedCustomerId: "c1", convertedAt: D("2026-11-01") }),
    ]);
    expect(r.total).toMatchObject({ contacted: 2, quoted: 1, converted: 1 });
  });
});

describe("rollupBatch: quoted", () => {
  it("counts a QUOTE activity on the lead", () => {
    const r = run([lead("a", 2), lead("b", 2)], { activities: [act("a", "QUOTE"), act("b", "CALL")] });
    expect(r.total).toMatchObject({ quoted: 1, contacted: 2 });
  });

  it("counts the QUOTED and NEGOTIATING pipeline stages", () => {
    const r = run([lead("a", 2, { stage: "QUOTED" }), lead("b", 2, { stage: "NEGOTIATING" }), lead("c", 2, { stage: "INTERESTED" })]);
    expect(r.total.quoted).toBe(2);
  });

  const conv = { convertedCustomerId: "c1", convertedAt: D("2026-11-01") };
  it("counts a non-draft Quote made for the converted customer after conversion", () => {
    const quotes: BatchQuote[] = [{ customerId: "c1", createdAt: D("2026-11-02"), status: "SENT" }];
    expect(run([lead("a", 2, conv)], { quotes }).total.quoted).toBe(1);
  });

  it("does not count a DRAFT quote, a quote older than the conversion, or another customer's quote", () => {
    const quotes: BatchQuote[] = [
      { customerId: "c1", createdAt: D("2026-11-02"), status: "DRAFT" },
      { customerId: "c1", createdAt: D("2026-10-01"), status: "SENT" },
      { customerId: "other", createdAt: D("2026-11-02"), status: "SENT" },
    ];
    expect(run([lead("a", 2, conv)], { quotes }).total.quoted).toBe(0);
  });
});

describe("rollupBatch: converted and value", () => {
  const conv = (cust: string, at = "2026-11-01") => ({ convertedCustomerId: cust, convertedAt: D(at) });

  it("converted means convertedCustomerId is set, not that the stage says so", () => {
    const r = run([lead("a", 2, conv("c1")), lead("b", 2, { stage: "ACTIVE_CUSTOMER" })]);
    expect(r.total.converted).toBe(1);
    expect(r.stageWonNotConverted).toBe(1);
  });

  it("sums Order totals for the converted customer from the conversion on, to the cent", () => {
    const orders: BatchOrder[] = [
      { customerId: "c1", orderDate: D("2026-11-05"), total: 100.1 },
      { customerId: "c1", orderDate: D("2026-12-01"), total: 200.2 },
      { customerId: "c1", orderDate: D("2026-11-01"), total: 50 },
    ];
    const r = run([lead("a", 2, conv("c1"))], { orders });
    expect(r.total.convertedValue).toBe(350.3);
    expect(tierRow(r, 2).convertedValue).toBe(350.3);
  });

  it("does not leak floating-point dust into the dollar total (0.01 + 0.14 in float is 0.15000000000000002)", () => {
    const orders: BatchOrder[] = [
      { customerId: "c1", orderDate: D("2026-11-05"), total: 0.01 },
      { customerId: "c1", orderDate: D("2026-11-06"), total: 0.14 },
    ];
    expect(run([lead("a", 2, conv("c1"))], { orders }).total.convertedValue).toBe(0.15);
  });

  it("excludes orders from before the conversion (a merged customer's older history is not this lead's win)", () => {
    const orders: BatchOrder[] = [{ customerId: "c1", orderDate: D("2025-01-01"), total: 9999 }];
    expect(run([lead("a", 2, conv("c1"))], { orders }).total.convertedValue).toBe(0);
  });

  it("excludes other customers' orders and unconverted leads", () => {
    const orders: BatchOrder[] = [{ customerId: "c2", orderDate: D("2026-12-01"), total: 500 }];
    const r = run([lead("a", 2, conv("c1")), lead("b", 2)], { orders });
    expect(r.total.convertedValue).toBe(0);
  });

  it("counts a customer's orders once when two leads merged into the same customer", () => {
    const orders: BatchOrder[] = [{ customerId: "c1", orderDate: D("2026-12-01"), total: 500 }];
    const r = run([lead("b", 2, conv("c1")), lead("a", 3, conv("c1"))], { orders });
    expect(r.total).toMatchObject({ converted: 2, convertedValue: 500 });
    expect(tierRow(r, 3).convertedValue).toBe(500); // lowest lead id gets the value, deterministically
    expect(tierRow(r, 2).convertedValue).toBe(0);
  });

  it("attributes value to each tier separately and computes conversion per contacted lead", () => {
    const leads = [lead("a", 2, conv("c1")), lead("b", 2), lead("c", 3), lead("d", 3, conv("c2"))];
    const orders: BatchOrder[] = [
      { customerId: "c1", orderDate: D("2026-12-01"), total: 1000 },
      { customerId: "c2", orderDate: D("2026-12-01"), total: 250 },
    ];
    const activities = [act("b", "CALL"), act("c", "CALL")];
    const r = run(leads, { orders, activities });
    expect(tierRow(r, 2)).toMatchObject({ leads: 2, contacted: 2, converted: 1, convertedValue: 1000, convertedPerContacted: 0.5 });
    expect(tierRow(r, 3)).toMatchObject({ leads: 2, contacted: 2, converted: 1, convertedValue: 250, convertedPerContacted: 0.5 });
    expect(r.total).toMatchObject({ convertedValue: 1250, convertedPerContacted: 0.5 });
  });

  it("flags a converted lead with no convertedAt: it counts as converted but no value can be dated", () => {
    const orders: BatchOrder[] = [{ customerId: "c1", orderDate: D("2026-12-01"), total: 500 }];
    const r = run([lead("a", 2, { convertedCustomerId: "c1" })], { orders });
    expect(r.total).toMatchObject({ converted: 1, convertedValue: 0 });
    expect(r.convertedWithoutDate).toBe(1);
  });
});

describe("rollupBatch: claimed and parked", () => {
  it("counts leads a rep has claimed and leads parked with no location", () => {
    const r = run([
      lead("a", 2, { assignedRepId: "rep1" }), lead("b", 2),
      lead("c", 8, { locationId: null }), lead("d", 8, { locationId: null, assignedRepId: "rep1" }),
    ]);
    expect(r.total).toMatchObject({ leads: 4, claimed: 2, parked: 2 });
    expect(tierRow(r, 8)).toMatchObject({ claimed: 1, parked: 2 });
  });
});
