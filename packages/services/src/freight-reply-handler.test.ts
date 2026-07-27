import { describe, expect, it } from "vitest";
import { handleFreightReply } from "./freight-reply-handler";

function fakeDb(overrides: { shipment?: any; updates?: any[] }) {
  const updates: any[] = overrides.updates ?? [];
  return {
    updates,
    db: {
      freightShipment: {
        findUnique: async () => overrides.shipment ?? null,
      },
      freightQuote: {
        update: async (args: any) => { updates.push(args); return {}; },
      },
    } as any,
  };
}

const shipment = {
  id: "s1",
  refCode: "RT-2607-001",
  originLabel: "Orlando, FL",
  equipmentType: "DRY_VAN_53",
  stops: [{ sequence: 1, consignee: { city: "Pearson", state: "GA" } }],
  quotes: [
    {
      id: "q1",
      status: "SENT",
      carrier: { name: "TMS", contacts: [{ email: "dayleen.marine@tms-transportation.com", active: true }] },
    },
  ],
};

const msg = { subject: "Re: Rate Request RT-2607-001: ...", fromEmail: "dayleen.marine@tms-transportation.com", text: "We can do $2450 all in, 1 day transit" };

describe("handleFreightReply", () => {
  it("ignores mail without a refCode in the subject", async () => {
    const { db } = fakeDb({});
    const r = await handleFreightReply({ ...msg, subject: "Newsletter" }, { db, extract: async () => null });
    expect(r).toEqual({ handled: false, reason: "no refCode" });
  });
  it("ignores refCodes with no shipment", async () => {
    const { db } = fakeDb({ shipment: null });
    const r = await handleFreightReply(msg, { db, extract: async () => null });
    expect(r.handled).toBe(false);
  });
  it("ignores senders that match no carrier contact", async () => {
    const { db } = fakeDb({ shipment });
    const r = await handleFreightReply({ ...msg, fromEmail: "stranger@spam.com" }, { db, extract: async () => null });
    expect(r).toEqual({ handled: false, reason: "sender not a carrier contact" });
  });
  it("stores a validated quote", async () => {
    const { db, updates } = fakeDb({ shipment });
    const r = await handleFreightReply(msg, {
      db,
      extract: async () => ({ verdict: "QUOTED", price: 2450, transitDays: 1, notes: "all in" }),
    });
    expect(r.handled).toBe(true);
    expect(updates[0].where).toEqual({ id: "q1" });
    expect(updates[0].data.status).toBe("QUOTED");
    expect(updates[0].data.price).toBe(2450);
    expect(updates[0].data.parsedByAi).toBe(true);
    expect(updates[0].data.rawReplyExcerpt).toContain("$2450");
  });
  it("marks NEEDS_ATTENTION when extraction returns null", async () => {
    const { db, updates } = fakeDb({ shipment });
    await handleFreightReply(msg, { db, extract: async () => null });
    expect(updates[0].data.status).toBe("NEEDS_ATTENTION");
    expect(updates[0].data.price).toBeUndefined();
  });
  it("maps QUESTION to NEEDS_ATTENTION", async () => {
    const { db, updates } = fakeDb({ shipment });
    await handleFreightReply(msg, { db, extract: async () => ({ verdict: "QUESTION", price: null, transitDays: null, notes: "what weight?" }) });
    expect(updates[0].data.status).toBe("NEEDS_ATTENTION");
    expect(updates[0].data.notes).toBe("what weight?");
  });
});
