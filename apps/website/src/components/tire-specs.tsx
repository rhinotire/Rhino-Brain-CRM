import type { PublicProductDTO } from "@rhino/services";
import { loadIndexLbs } from "@/lib/trailer-load";

/**
 * Industry-grade tire spec presentation: raw codes are translated into what
 * they mean (load index → pounds, speed rating → mph, kebab-case labels →
 * plain English). Empty fields hide themselves — no "N/A" walls.
 */

/** Standard speed-symbol → mph table. */
const SPEED_MPH: Record<string, number> = {
  L: 75, M: 81, N: 87, P: 93, Q: 99, R: 106, S: 112, T: 118, U: 124, H: 130, V: 149, W: 168, Y: 186,
};

const title = (s: string) => s.split(/[-_ ]+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

/** "121/118" → "121/118 (3,197 / 2,910 lbs)" · "94" → "94 (1,477 lbs)" */
function loadIndexLabel(li: string): string {
  const parts = li.split("/").map((p) => loadIndexLbs(Number(p)));
  if (parts.some((p) => p === null)) return li;
  return `${li} (${parts.map((p) => p!.toLocaleString("en-US")).join(" / ")} lbs)`;
}

function speedLabel(s: string): string {
  if (s.toUpperCase() === "Z") return "Z (149+ mph)";
  const mph = SPEED_MPH[s.toUpperCase()];
  return mph ? `${s.toUpperCase()} (${mph} mph)` : s.toUpperCase();
}

export function TireSpecs({ p }: { p: PublicProductDTO }) {
  const t = p.tireSpec;
  if (!t) return null;

  const badges: { label: string; hint: string }[] = [];
  if (t.threePMSF) badges.push({ label: "❄ 3PMSF", hint: "Three-Peak Mountain Snowflake — severe snow rated" });
  if (t.runFlat) badges.push({ label: "Run Flat", hint: "Drivable for a limited distance after pressure loss" });
  if (t.mileageWarrantyMiles) badges.push({ label: `${t.mileageWarrantyMiles.toLocaleString("en-US")}-mile warranty`, hint: "Manufacturer treadwear mileage warranty" });

  const rows: [string, string | null][] = [
    ["Size", p.sizeSpec],
    ["Service Description", t.loadIndex && t.speedRating ? `${t.loadIndex}${t.speedRating}` : null],
    ["Load Index", t.loadIndex ? loadIndexLabel(t.loadIndex) : null],
    ["Speed Rating", t.speedRating ? speedLabel(t.speedRating) : null],
    ["Load Range", t.loadRange ? `${t.loadRange}${t.plyRating ? ` (${t.plyRating}-ply rating)` : ""}` : t.plyRating ? `${t.plyRating}-ply rating` : null],
    ["Max Load", t.maxLoadLbs ? `${t.maxLoadLbs.toLocaleString("en-US")} lbs per tire` : null],
    ["Max Inflation Pressure", t.maxPressurePsi ? `${t.maxPressurePsi} PSI` : null],
    ["Tread Type", t.treadType ? title(t.treadType) : null],
    ["Position", t.position ? title(t.position) : null],
    ["Application", t.application ? title(t.application) : null],
    ["Construction", t.construction === "R" ? "Radial" : t.construction === "D" ? "Bias" : t.construction],
    ["Tread Depth", t.treadDepth32nds ? `${t.treadDepth32nds}/32"` : null],
    ["UTQG", t.utqg],
    ["Sidewall Style", t.sidewallStyle],
    ["Overall Diameter", t.overallDiameterIn ? `${t.overallDiameterIn}"` : null],
    ["Section Width", t.sectionWidthIn ? `${t.sectionWidthIn}"` : null],
    ["Approved Rim Widths", t.rimWidthRange],
    ["Mileage Warranty", t.mileageWarrantyMiles ? `${t.mileageWarrantyMiles.toLocaleString("en-US")} miles` : null],
    ["Country of Origin", p.countryOfOrigin],
    ["Warranty", p.warrantySummary],
  ];
  const filled = rows.filter((r): r is [string, string] => !!r[1]);

  return (
    <div>
      {badges.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {badges.map((b) => (
            <span key={b.label} title={b.hint}
              className="rounded-full bg-navy-900 px-3 py-1 text-xs font-bold text-brand-light">
              {b.label}
            </span>
          ))}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="mt-3 w-full max-w-2xl border-collapse text-sm">
          <tbody>
            {filled.map(([k, v]) => (
              <tr key={k} className="border-b border-slate-200">
                <th scope="row" className="w-1/2 py-2 pr-4 text-left font-semibold text-slate-500">{k}</th>
                <td className="py-2">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 max-w-2xl text-xs text-slate-400">
        Load index and speed rating meanings follow the standard industry tables — capacity applies at maximum cold
        inflation pressure. Always confirm against the markings on the tire itself.
      </p>
    </div>
  );
}
