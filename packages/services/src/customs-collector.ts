/**
 * ImportGenius customs/bill-of-lading collector (spec Phase 2 CUSTOMS source,
 * pulled forward — owner bought ImportGenius 2026-07-25).
 *
 * Strategy: search shipments (by product keyword or by shipper = competitor
 * factory), aggregate rows by consignee → each unique consignee is an
 * importer with hard purchasing evidence (shipment count, suppliers, product
 * descriptions) that feeds the six-check scorer's "purchasing logic" check.
 *
 * API: GET https://data.importgenius.com/v2/shipments
 *   ?q=<field>+<modifier>+<term>&access_token=..&country=us&type=im
 *   → { total, rows (max 10), current_balance }  — each query costs credits.
 */
export type CustomsSearchField = "product" | "consname" | "shipname";

export type CustomsShipmentRow = Record<string, unknown>;

export type ConsigneeAggregate = {
  consignee: string;
  shipmentCount: number;
  shippers: string[];
  sampleProducts: string[];
  city: string | null;
  state: string | null;
};

const pickStr = (row: CustomsShipmentRow, keys: string[]): string => {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
};

export async function searchShipmentsPage(opts: {
  field: CustomsSearchField;
  modifier?: "contains" | "exactly" | "any" | "starts_with" | "ends_with";
  term: string;
  country?: string; // ImportGenius country code, default "us"
  type?: "im" | "ex";
  page?: number;
  accessToken: string;
  fetchFn?: typeof fetch;
}): Promise<{ rows: CustomsShipmentRow[]; total: number; balance: number | null }> {
  const f = opts.fetchFn ?? fetch;
  const url = new URL("https://data.importgenius.com/v2/shipments");
  url.searchParams.set("q", `${opts.field} ${opts.modifier ?? "contains"} ${opts.term}`);
  url.searchParams.set("access_token", opts.accessToken);
  url.searchParams.set("country", opts.country ?? "us");
  url.searchParams.set("type", opts.type ?? "im");
  if (opts.page && opts.page > 1) url.searchParams.set("page", String(opts.page));
  const res = await f(url.toString());
  if (!res.ok) throw new Error(`ImportGenius ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as { total?: number; rows?: CustomsShipmentRow[]; current_balance?: number };
  return { rows: body.rows ?? [], total: body.total ?? 0, balance: body.current_balance ?? null };
}

/** Group shipment rows into unique importers. Field names vary per country
 * dataset, so we probe several conventional keys. */
export function aggregateConsignees(rows: CustomsShipmentRow[]): ConsigneeAggregate[] {
  const map = new Map<string, ConsigneeAggregate>();
  for (const row of rows) {
    const consignee = pickStr(row, ["consname", "consignee", "consignee_name", "cons_name"]);
    if (!consignee || /order of|to order|unknown/i.test(consignee)) continue;
    const key = consignee.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!key) continue;
    const shipper = pickStr(row, ["shipname", "shipper", "shipper_name", "ship_name"]);
    const product = pickStr(row, ["product", "product_desc", "description", "productdesc"]).slice(0, 120);
    const city = pickStr(row, ["conscity", "consignee_city", "city"]) || null;
    const state = (pickStr(row, ["consstate", "consignee_state", "state"]) || null)?.toUpperCase() ?? null;
    const agg = map.get(key) ?? { consignee, shipmentCount: 0, shippers: [], sampleProducts: [], city, state };
    agg.shipmentCount++;
    if (shipper && !agg.shippers.includes(shipper) && agg.shippers.length < 5) agg.shippers.push(shipper);
    if (product && !agg.sampleProducts.includes(product) && agg.sampleProducts.length < 3) agg.sampleProducts.push(product);
    if (!agg.city && city) agg.city = city;
    if (!agg.state && state) agg.state = state;
    map.set(key, agg);
  }
  return [...map.values()].sort((a, b) => b.shipmentCount - a.shipmentCount);
}
