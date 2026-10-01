import { describe, expect, it } from "vitest";
import { optimizeStopOrder, zipLatLng } from "./geo";

describe("optimizeStopOrder", () => {
  it("orders DFW stops geographically instead of tap order", () => {
    // Tap order deliberately zig-zags: Red Oak (south), Frisco (north), DeSoto (south), Plano (north)
    const stops = [
      { id: "redoak", zip: "75154" },
      { id: "frisco", zip: "75034" },
      { id: "desoto", zip: "75115" },
      { id: "plano", zip: "75074" },
    ];
    // start in Irving (rep's current position)
    const start = zipLatLng("75060");
    const { orderedIds, totalMiles } = optimizeStopOrder(stops, start);

    // the two southern stops must be adjacent, and the two northern stops adjacent
    const south = [orderedIds.indexOf("redoak"), orderedIds.indexOf("desoto")].sort((a, b) => a - b);
    const north = [orderedIds.indexOf("frisco"), orderedIds.indexOf("plano")].sort((a, b) => a - b);
    expect(Math.abs(south[0] - south[1])).toBe(1);
    expect(Math.abs(north[0] - north[1])).toBe(1);
    expect(totalMiles).toBeGreaterThan(10);
    expect(totalMiles).toBeLessThan(120);
  });

  it("keeps unknown-zip stops at the end and survives tiny inputs", () => {
    const { orderedIds } = optimizeStopOrder(
      [{ id: "a", zip: "75154" }, { id: "x", zip: null }, { id: "b", zip: "75034" }],
      null,
    );
    expect(orderedIds[orderedIds.length - 1]).toBe("x");
    expect(optimizeStopOrder([{ id: "only", zip: "75154" }]).orderedIds).toEqual(["only"]);
    expect(optimizeStopOrder([]).orderedIds).toEqual([]);
  });

  it("beats or matches the zig-zag tap order on total distance", () => {
    const stops = [
      { id: "redoak", zip: "75154" },
      { id: "frisco", zip: "75034" },
      { id: "desoto", zip: "75115" },
      { id: "plano", zip: "75074" },
    ];
    const start = zipLatLng("75060")!;
    const { totalMiles } = optimizeStopOrder(stops, start);
    // zig-zag distance computed the same way for comparison
    const pts = stops.map(s => zipLatLng(s.zip)!);
    const hav = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
      const R = 3958.8, dLat = ((b.lat - a.lat) * Math.PI) / 180, dLng = ((b.lng - a.lng) * Math.PI) / 180;
      const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(s));
    };
    let zigzag = hav(start, pts[0]);
    for (let i = 0; i < pts.length - 1; i++) zigzag += hav(pts[i], pts[i + 1]);
    expect(totalMiles!).toBeLessThanOrEqual(zigzag + 0.01);
  });
});
