import { describe, expect, it } from "vitest";
import { parseJsonReply } from "./claude-json";

describe("parseJsonReply", () => {
  it("parses bare JSON", () => {
    expect(parseJsonReply('{"a":1}')).toEqual({ a: 1 });
  });
  it("strips ```json fences", () => {
    expect(parseJsonReply('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it("rescues JSON followed by trailing prose (real failure 2026-07-25)", () => {
    const reply = '{"pool":"A_BUYER","score":80}\n\nNote: I scored this based on the wholesale signals.';
    expect(parseJsonReply(reply)).toEqual({ pool: "A_BUYER", score: 80 });
  });
  it("rescues JSON with leading prose and fence mid-text", () => {
    const reply = 'Here is the JSON you asked for:\n```json\n{"a":{"b":2}}\n```\nLet me know if you need changes.';
    expect(parseJsonReply(reply)).toEqual({ a: { b: 2 } });
  });
  it("throws a readable error when no JSON object exists", () => {
    expect(() => parseJsonReply("I cannot answer that.")).toThrow(/not JSON/);
  });
});
