import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as XLSX from "xlsx";
import { readCoordinateCandidates } from "./dealer-coordinates-file";

const dir = mkdtempSync(join(tmpdir(), "coords-test-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const HEADER = ["#", "Dealer Name", "Street", "City", "State / Province", "ST", "ZIP / Postal", "Country", "Phone", "Latitude", "Longitude"];
const row = (n: number, name: string, phone: string, lat: string | number, lng: string | number) =>
  [n, name, "1 Main St", "Orlando", "Florida", "FL", "32801", "US", phone, lat, lng];

function workbook(rows: unknown[][]): string {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEADER, ...rows]), "Dealers");
  const path = join(dir, `w${Math.random().toString(36).slice(2)}.xlsx`);
  XLSX.writeFile(wb, path);
  return path;
}

describe("readCoordinateCandidates: a blank coordinate cell is not 0", () => {
  it("keeps a row with both coordinates", async () => {
    const m = await readCoordinateCandidates(workbook([row(1, "Good Wheels", "407-555-0101", "28.5383", "-81.3792")]));
    expect([...m.values()].flat()).toEqual([expect.objectContaining({ lat: 28.5383, lng: -81.3792 })]);
  });

  it("drops a row whose LATITUDE is blank, even with a real longitude", async () => {
    const m = await readCoordinateCandidates(workbook([row(1, "No Lat Wheels", "407-555-0102", "", "-81.3792")]));
    expect(m.size).toBe(0);
  });

  it("drops a row whose LONGITUDE is blank, even with a real latitude", async () => {
    const m = await readCoordinateCandidates(workbook([row(1, "No Lng Wheels", "407-555-0103", "28.5383", "")]));
    expect(m.size).toBe(0);
  });

  it("drops whitespace-only cells on either axis", async () => {
    const m = await readCoordinateCandidates(workbook([
      row(1, "Space Lat", "407-555-0104", "   ", "-81.3792"),
      row(2, "Space Lng", "407-555-0105", "28.5383", "  "),
    ]));
    expect(m.size).toBe(0);
  });

  it("drops an explicit 0 on one axis too (the scraper's 'no value' default), not just 0,0", async () => {
    const m = await readCoordinateCandidates(workbook([
      row(1, "Zero Lat", "407-555-0109", "0", "-81.3792"),
      row(2, "Zero Lng", "407-555-0110", "28.5383", "0"),
    ]));
    expect(m.size).toBe(0);
  });

  it("still drops 0,0 and out-of-range rows, and keeps the good rows beside the bad ones", async () => {
    const m = await readCoordinateCandidates(workbook([
      row(1, "Null Island", "407-555-0106", "0", "0"),
      row(2, "Off Planet", "407-555-0107", "95", "-81"),
      row(3, "Good Wheels", "407-555-0108", "28.6", "-81.4"),
    ]));
    expect(m.size).toBe(1);
  });
});
