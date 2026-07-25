import { describe, expect, it } from "vitest";
import { aggregateConsignees, searchShipmentsPage } from "./customs-collector";

describe("searchShipmentsPage", () => {
  it("builds the q/access_token/country params and maps the response", async () => {
    let captured = "";
    const fakeFetch = (async (url: RequestInfo | URL) => {
      captured = String(url);
      return new Response(JSON.stringify({ total: 42, rows: [{ consname: "ABC Tires" }], current_balance: 990 }), { status: 200 });
    }) as typeof fetch;
    const r = await searchShipmentsPage({ field: "product", term: "pneumatic tire", accessToken: "tok", fetchFn: fakeFetch });
    expect(captured).toContain("data.importgenius.com/v2/shipments");
    expect(captured).toContain("q=product+contains+pneumatic+tire");
    expect(captured).toContain("access_token=tok");
    expect(captured).toContain("country=us");
    expect(r.total).toBe(42);
    expect(r.balance).toBe(990);
    expect(r.rows).toHaveLength(1);
  });
  it("throws readable error on non-200", async () => {
    const fakeFetch = (async () => new Response("invalid token", { status: 401 })) as typeof fetch;
    await expect(searchShipmentsPage({ field: "product", term: "tire", accessToken: "bad", fetchFn: fakeFetch })).rejects.toThrow(/401/);
  });
});

describe("aggregateConsignees", () => {
  it("groups rows by consignee, counts shipments, dedupes shippers/products", () => {
    const rows = [
      { consname: "Lone Star Tire Import LLC", shipname: "Qingdao Factory A", product: "PNEUMATIC TIRES 295/75R22.5", consstate: "tx", conscity: "Houston" },
      { consname: "LONE STAR TIRE IMPORT, LLC", shipname: "Qingdao Factory B", product: "TBR TIRES" },
      { consname: "Sunshine Wheels Inc", shipname: "Qingdao Factory A", product: "STEEL WHEELS" },
      { consname: "TO ORDER", shipname: "X", product: "TIRES" },
    ];
    const aggs = aggregateConsignees(rows);
    expect(aggs).toHaveLength(2);
    expect(aggs[0]).toMatchObject({
      consignee: "Lone Star Tire Import LLC",
      shipmentCount: 2,
      shippers: ["Qingdao Factory A", "Qingdao Factory B"],
      state: "TX",
      city: "Houston",
    });
    expect(aggs[1].shipmentCount).toBe(1);
  });
});
