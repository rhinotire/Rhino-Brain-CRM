import { readFile } from "node:fs/promises";
import * as XLSX from "xlsx";
import { dedupeKeyFor } from "./prospect-dedupe";
import type { CoordCandidate } from "./dealer-import-rules";

/**
 * Reads the Fuel Off-Road locator scrape (sheet "Dealers": #, Dealer Name,
 * Street, City, State / Province, ST, ZIP / Postal, Country, Phone, Latitude,
 * Longitude) into coordinate candidates grouped by the same dedupeKey the
 * dealer parser derives (phone, else name+city).
 *
 * A key can hold several rows (one phone shared by several branches), so each
 * key maps to a LIST; dealer-import-rules.pickCoordinate chooses the row that
 * belongs to the dealer's top-level city. Rows with no usable lat/lng, or
 * exactly 0,0, are dropped.
 */
export async function readCoordinateCandidates(path: string): Promise<Map<string, CoordCandidate[]>> {
  const wb = XLSX.read(await readFile(path), { type: "buffer" });
  const ws = wb.Sheets["Dealers"];
  if (!ws) throw new Error(`Coordinate workbook is missing sheet "Dealers": ${path}`);
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: "", blankrows: false });

  const headerIdx = grid.findIndex((r) => String(r[1] ?? "").trim() === "Dealer Name");
  if (headerIdx < 0) throw new Error(`Coordinate workbook has no "Dealer Name" header row: ${path}`);
  const col = (name: string): number => {
    const i = grid[headerIdx].findIndex((h) => String(h ?? "").trim() === name);
    if (i < 0) throw new Error(`Coordinate workbook is missing column "${name}"`);
    return i;
  };
  const cName = col("Dealer Name");
  const cCity = col("City");
  const cSt = col("ST");
  const cZip = col("ZIP / Postal");
  const cPhone = col("Phone");
  const cLat = col("Latitude");
  const cLng = col("Longitude");

  const text = (v: unknown): string => (v == null ? "" : String(v).trim());
  const out = new Map<string, CoordCandidate[]>();
  for (const r of grid.slice(headerIdx + 1)) {
    const lat = Number(text(r[cLat]));
    const lng = Number(text(r[cLng]));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) continue;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
    const key = dedupeKeyFor({ phone: text(r[cPhone]), companyName: text(r[cName]), city: text(r[cCity]) });
    if (!key) continue;
    const list = out.get(key) ?? [];
    list.push({ city: text(r[cCity]), state: text(r[cSt]), zip: text(r[cZip]), lat, lng });
    out.set(key, list);
  }
  return out;
}
