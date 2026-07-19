import { describe, expect, it } from "vitest";
import { deriveSpecFromProduct } from "./spec-rules";

describe("deriveSpecFromProduct — deterministic layer", () => {
  it("trailer tire: size math + ply→load-range table", () => {
    const s = deriveSpecFromProduct({ sizeSpec: "ST235/80R16", description: "GF706 ST Radial 14PR", rawCategory: "Trailer" });
    expect(s).toMatchObject({
      width: 235, aspectRatio: 80, rimDiameter: 16, construction: "R",
      plyRating: 14, loadRange: "G", application: "trailer",
    });
  });

  it("commercial drive tire with load index (bare 'drive' no longer auto-fills position)", () => {
    const s = deriveSpecFromProduct({ sizeSpec: "11R22.5", description: "HS208 Drive Position 16-ply 146/143L" });
    expect(s).toMatchObject({ rimDiameter: 22.5, plyRating: 16, loadRange: "H", loadIndex: "146/143", speedRating: "L" });
    expect(s.position).toBeUndefined(); // closed vs open shoulder needs a human or explicit text
  });

  it("shoulder-design positions from explicit text", () => {
    expect(deriveSpecFromProduct({ sizeSpec: "11R22.5", description: "HD878 Closed Shoulder Drive 16PR" }).position).toBe("closed-shoulder-drive");
    expect(deriveSpecFromProduct({ sizeSpec: "11R22.5", description: "HD858 Open Shoulder Drive 16PR" }).position).toBe("open-shoulder-drive");
  });

  it("explicit Load Range beats nothing, cross-fills PR", () => {
    const s = deriveSpecFromProduct({ sizeSpec: "ST205/75R15", description: "Load Range D trailer special" });
    expect(s.loadRange).toBe("D");
    expect(s.plyRating).toBe(8);
  });

  it("LT all-terrain", () => {
    const s = deriveSpecFromProduct({ sizeSpec: "LT285/70R17", description: "HD878 All-Terrain 10-ply 121/118S" });
    expect(s).toMatchObject({ width: 285, treadType: "all-terrain", plyRating: 10, loadRange: "E", loadIndex: "121/118", speedRating: "S" });
  });

  it("bias word overrides construction", () => {
    const s = deriveSpecFromProduct({ sizeSpec: "ST205/75R15", description: "Bias trailer tire 8PR" });
    expect(s.construction).toBe("D");
  });

  // ---- real supplier sizeSpec formats (sampled from production DB) ----

  it("ply suffix on trailer size: ST175/80R13-6PR", () => {
    const s = deriveSpecFromProduct({ sizeSpec: "ST175/80R13-6PR", description: "STRY KAT TRL", rawCategory: "ST Trailer Tires" });
    expect(s).toMatchObject({ width: 175, aspectRatio: 80, rimDiameter: 13, plyRating: 6, loadRange: "C", application: "trailer", position: "trailer" });
  });

  it("bare-P ply suffix on TBR size: 235/75R17.5-16P + A/P description", () => {
    const s = deriveSpecFromProduct({ sizeSpec: "235/75R17.5-16P", description: "Bullride A/P BRH101", rawCategory: "TBR Tires" });
    expect(s).toMatchObject({ width: 235, rimDiameter: 17.5, plyRating: 16, loadRange: "H", position: "all-position" });
  });

  it("digit-only ply suffix + LT suffix on flotation: LT31X10.50R15-6 / 30x9.50R15LT-6P", () => {
    const a = deriveSpecFromProduct({ sizeSpec: "LT31X10.50R15-6", description: "GREEN MAX OPTIMUM H/T" });
    expect(a).toMatchObject({ rimDiameter: 15, overallDiameterIn: 31, sectionWidthIn: 10.5, plyRating: 6, loadRange: "C", treadType: "highway" });
    const b = deriveSpecFromProduct({ sizeSpec: "30x9.50R15LT-6P", description: "Lion Sport A/T" });
    expect(b).toMatchObject({ rimDiameter: 15, overallDiameterIn: 30, plyRating: 6, treadType: "all-terrain" });
  });

  it("trailing LT with no ply: 33X12.50R15LT + load index in description", () => {
    const s = deriveSpecFromProduct({ sizeSpec: "33X12.50R15LT", description: "CROSSWIND M/T TIRE 108Q" });
    expect(s).toMatchObject({ rimDiameter: 15, overallDiameterIn: 33, treadType: "mud-terrain", loadIndex: "108", speedRating: "Q" });
  });

  it("ZR performance size: 205/45ZR16", () => {
    const s = deriveSpecFromProduct({ sizeSpec: "205/45ZR16", description: "ACCELERA PHI" });
    expect(s).toMatchObject({ width: 205, aspectRatio: 45, rimDiameter: 16, construction: "R", speedRating: "Z" });
  });

  it("space-separated ply suffix: 11R22.5 16PR", () => {
    const s = deriveSpecFromProduct({ sizeSpec: "11R22.5 16PR", description: "KINBLI KS205 146/146M A/P" });
    expect(s).toMatchObject({ rimDiameter: 22.5, plyRating: 16, loadRange: "H", construction: "R", position: "all-position", loadIndex: "146/146", speedRating: "M" });
  });

  it("euro commercial C suffix: 195/75R16C-8PR", () => {
    const s = deriveSpecFromProduct({ sizeSpec: "195/75R16C-8PR", description: "" });
    expect(s).toMatchObject({ width: 195, aspectRatio: 75, rimDiameter: 16, plyRating: 8, loadRange: "D" });
  });

  it("mileage warranty: 50,000 Mile", () => {
    const s = deriveSpecFromProduct({ sizeSpec: "175/70R13", description: "Lion Sport GP 50,000 Mile" });
    expect(s.mileageWarrantyMiles).toBe(50000);
  });

  it("dash separators are not mistaken for ply suffix: 225-65-17", () => {
    const s = deriveSpecFromProduct({ sizeSpec: "225-65-17", description: "" });
    expect(s).toMatchObject({ width: 225, aspectRatio: 65, rimDiameter: 17 });
    expect(s.plyRating).toBeUndefined();
  });

  it("never invents values from empty input", () => {
    const s = deriveSpecFromProduct({ sizeSpec: null, description: "Steel wheel", rawCategory: null });
    expect(s.loadRange).toBeUndefined();
    expect(s.plyRating).toBeUndefined();
    expect(s.width).toBeUndefined();
  });
});
