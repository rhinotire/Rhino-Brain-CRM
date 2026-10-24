import { readFile } from "node:fs/promises";
import * as XLSX from "xlsx";
import { dedupeKeyFor } from "./prospect-dedupe";

/**
 * Parser for the multi-brand wheel dealer-locator workbook. One sheet per
 * brand; the same dealer commonly appears on several sheets, so rows are
 * merged into one record carrying the set of brands that list it.
 */

export const DEALER_SHEETS = [
  "KG1 FORGED",
  "AMERICAN FORCE",
  "FUEL OFF-ROAD",
  "JTX FORGED",
  "GOLF CART (STEELENG)",
] as const;

export type RawDealerRow = {
  brand: string;
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string; // untrusted — carried in so tests can prove it is ignored
  phone: string;
  email: string;
  website: string;
};

export type DealerRecord = {
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  website: string;
  brands: string[]; // sorted, deduped
  country: "US" | "CA" | "OTHER"; // derived from STATE, never from the Country column
  dedupeKey: string; // "" when not dedupable
};

const US_STATES = new Set(
  (
    "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO " +
    "MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY " +
    "DC PR GU VI AS MP"
  ).split(" "),
);
const CA_PROVINCES = new Set(
  "AB BC MB NB NL NS NT NU ON PE QC SK YT".split(" "),
);

export function countryFromState(state: string): "US" | "CA" | "OTHER" {
  const s = state.trim().toUpperCase();
  if (US_STATES.has(s)) return "US";
  if (CA_PROVINCES.has(s)) return "CA";
  return "OTHER";
}

const FILL_FIELDS = ["name", "street", "city", "state", "zip", "phone", "email", "website"] as const;

export function mergeDealerRows(rows: RawDealerRow[]): DealerRecord[] {
  const records: DealerRecord[] = [];
  const byKey = new Map<string, DealerRecord>();

  for (const row of rows) {
    const clean = {
      name: (row.name ?? "").trim(),
      street: (row.street ?? "").trim(),
      city: (row.city ?? "").trim(),
      state: (row.state ?? "").trim(),
      zip: (row.zip ?? "").trim(),
      phone: (row.phone ?? "").trim(),
      email: (row.email ?? "").trim(),
      website: (row.website ?? "").trim(),
    };
    const brand = (row.brand ?? "").trim();
    // Website is deliberately not part of the merge key (spec: phone/name+city).
    const dedupeKey = dedupeKeyFor({ phone: clean.phone, companyName: clean.name, city: clean.city });

    // "" is never a merge key: a non-dedupable row stands alone.
    const existing = dedupeKey ? byKey.get(dedupeKey) : undefined;
    if (existing) {
      for (const f of FILL_FIELDS) if (!existing[f] && clean[f]) existing[f] = clean[f];
      existing.country = countryFromState(existing.state);
      if (brand && !existing.brands.includes(brand)) existing.brands.push(brand);
      continue;
    }

    const rec: DealerRecord = {
      ...clean,
      brands: brand ? [brand] : [],
      country: countryFromState(clean.state),
      dedupeKey,
    };
    records.push(rec);
    if (dedupeKey) byKey.set(dedupeKey, rec);
  }

  for (const r of records) r.brands.sort();
  return records;
}

const cell = (v: unknown): string => (v == null ? "" : String(v).trim());

/** Reads the five brand sheets (row 1 = header) and merges across them. */
export async function parseDealerWorkbook(path: string): Promise<DealerRecord[]> {
  const buf = await readFile(path);
  const wb = XLSX.read(buf, { type: "buffer" });
  const raw: RawDealerRow[] = [];

  for (const sheetName of DEALER_SHEETS) {
    const ws = wb.Sheets[sheetName];
    if (!ws) throw new Error(`Dealer workbook is missing sheet "${sheetName}"`);
    // raw:false -> formatted text, so numeric phones/zips don't become 4.8E+9
    const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: "", blankrows: false });
    for (const r of grid.slice(1)) {
      raw.push({
        brand: sheetName,
        state: cell(r[0]),
        city: cell(r[1]),
        name: cell(r[2]),
        street: cell(r[3]),
        zip: cell(r[4]),
        country: cell(r[5]),
        phone: cell(r[6]),
        email: cell(r[7]),
        website: cell(r[8]),
      });
    }
  }
  return mergeDealerRows(raw);
}
