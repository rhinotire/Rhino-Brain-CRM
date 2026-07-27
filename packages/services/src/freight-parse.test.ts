import { describe, expect, it } from "vitest";
import { validateParsedReply, extractFreightQuote } from "./freight-parse";

describe("validateParsedReply", () => {
  it("accepts a valid quote", () => {
    const r = validateParsedReply({ verdict: "QUOTED", price: 2450, transitDays: 2, notes: "fuel included" });
    expect(r).toEqual({ verdict: "QUOTED", price: 2450, transitDays: 2, notes: "fuel included" });
  });
  it("rejects QUOTED without a price (never guess)", () => {
    expect(validateParsedReply({ verdict: "QUOTED", price: null, transitDays: 2, notes: "" })).toBeNull();
  });
  it("rejects implausible price", () => {
    expect(validateParsedReply({ verdict: "QUOTED", price: 12, transitDays: 2, notes: "" })).toBeNull();
    expect(validateParsedReply({ verdict: "QUOTED", price: 999999, transitDays: 2, notes: "" })).toBeNull();
  });
  it("accepts DECLINED without price", () => {
    expect(validateParsedReply({ verdict: "DECLINED", price: null, transitDays: null, notes: "no trucks" })?.verdict).toBe("DECLINED");
  });
  it("nulls out-of-range transitDays but keeps the quote", () => {
    const r = validateParsedReply({ verdict: "QUOTED", price: 2450, transitDays: 45, notes: "" });
    expect(r?.price).toBe(2450);
    expect(r?.transitDays).toBeNull();
  });
  it("rejects unknown verdicts and garbage", () => {
    expect(validateParsedReply({ verdict: "MAYBE", price: 100, transitDays: 1, notes: "" })).toBeNull();
    expect(validateParsedReply("not an object")).toBeNull();
    expect(validateParsedReply(null)).toBeNull();
  });
  it("truncates long notes to 500 chars", () => {
    const r = validateParsedReply({ verdict: "QUESTION", price: null, transitDays: null, notes: "x".repeat(900) });
    expect(r?.notes.length).toBe(500);
  });
});

describe("extractFreightQuote", () => {
  const ctx = { refCode: "RT-2607-001", route: "Orlando, FL -> Pearson GA", equipment: "53' Dry Van" };
  it("passes email text through the ask function and validates", async () => {
    const fakeAsk = async () => ({ json: { verdict: "QUOTED", price: 1875.5, transitDays: 1, notes: "" }, inputTokens: 1, outputTokens: 1 });
    const r = await extractFreightQuote("We can do $1875.50, next-day", ctx, fakeAsk as any);
    expect(r?.price).toBe(1875.5);
  });
  it("returns null when the API throws", async () => {
    const fakeAsk = async () => { throw new Error("boom"); };
    expect(await extractFreightQuote("hi", ctx, fakeAsk as any)).toBeNull();
  });
  it("returns null when the model returns junk", async () => {
    const fakeAsk = async () => ({ json: { verdict: "QUOTED", price: "call me" }, inputTokens: 1, outputTokens: 1 });
    expect(await extractFreightQuote("hi", ctx, fakeAsk as any)).toBeNull();
  });
});
