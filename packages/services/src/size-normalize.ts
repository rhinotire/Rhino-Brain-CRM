/**
 * Tire-size input normalization (tire-discovery Phase 0, spec §1A/§26).
 * Accepts the formats professionals actually type and returns "needles" —
 * canonical substrings to match against Product.sizeSpec case-insensitively.
 *
 *   225/65R17 · 2256517 · 225 65 17 · 225-65-R17 · 295/75R22.5 · 29575225
 *   ST235/80R16 · ST23580R16 · 11R22.5 · 11R225 · 33X12.50R20 · 33 12.50 20
 */

export type NormalizedSize =
  | { kind: "metric"; prefix: string; width: number; aspect: number; rim: number; display: string }
  | { kind: "truck"; width: number; rim: number; display: string } // 11R22.5 rim-only format
  | { kind: "flotation"; diameter: number; width: number; rim: number; display: string };

const rimOk = (r: number) => r >= 8 && r <= 30;

function metric(prefix: string, w: number, a: number, r: number): NormalizedSize | null {
  if (w < 100 || w > 445 || a < 20 || a > 100 || !rimOk(r)) return null;
  return { kind: "metric", prefix, width: w, aspect: a, rim: r, display: `${prefix}${w}/${a}R${r}` };
}

function truck(w: number, r: number): NormalizedSize | null {
  if (w < 7 || w > 16 || !rimOk(r)) return null;
  return { kind: "truck", width: w, rim: r, display: `${w}R${r}` };
}

function flotation(d: number, w: number, r: number): NormalizedSize | null {
  if (d < 25 || d > 60 || w < 6 || w > 24 || !rimOk(r) || d <= r) return null;
  return { kind: "flotation", diameter: d, width: w, rim: r, display: `${d}X${w}R${r}` };
}

/** ".5"-aware rim parser: "225"→22.5, "245"→24.5, "165"→16.5, "17"→17 */
const parseRim = (s: string): number => {
  const n = Number(s);
  if (s.length === 3 && !s.includes(".") && n >= 100) return n / 10;
  return n;
};

export function normalizeSizeInput(raw: string): NormalizedSize | null {
  const direct = parseSize(raw);
  if (direct) return direct;
  // Dealers often type the full supplier spec with a ply suffix
  // ("ST225/75R15-10PR", "11R22.5 16PR", "235/75R17.5-16P") — strip it and retry.
  const v = raw.trim().toUpperCase();
  const m = v.match(/^(.*\d(?:LT|C)?)\s*[-\s]\s*\d{1,2}\s*(?:PR|P)?\s*$/);
  if (m) return parseSize(m[1]);
  return null;
}

function parseSize(raw: string): NormalizedSize | null {
  let v = raw.trim().toUpperCase();
  if (!v || v.length < 4) return null;
  // unify separators: spaces / dashes / dots-between-groups → single space
  v = v.replace(/[-–—]/g, " ").replace(/\s+/g, " ").trim();

  // ---- flotation: 33X12.50R20 / 33 12.50 20 / LT31X10.50R15 / 30X9.50R15LT ----
  let m = v.replace(/\s/g, "").match(/^(?:LT)?(\d{2}(?:\.\d)?)[X/](\d{1,2}(?:\.\d{1,2})?)(?:R|D|B)?(\d{2}(?:\.\d)?)(?:LT)?$/);
  if (m) return flotation(Number(m[1]), Number(m[2]), parseRim(m[3]));
  m = v.match(/^(\d{2}(?:\.\d)?) (\d{1,2}\.\d{1,2}) (?:R ?)?(\d{2}(?:\.\d)?)$/);
  if (m) return flotation(Number(m[1]), Number(m[2]), parseRim(m[3]));

  const compact = v.replace(/[\s/]/g, "");

  // ---- truck rim-only: 11R22.5 / 11R225 / 12R22.5 ----
  m = compact.match(/^(\d{1,2}(?:\.\d)?)R(\d{2,3}(?:\.\d)?)$/);
  if (m && Number(m[1]) <= 16) {
    const t = truck(Number(m[1]), parseRim(m[2]));
    if (t) return t;
  }

  // ---- metric with letters: ST235/80R16 / 205/45ZR16 / 225/70R15C / 225 65 17 ----
  m = compact.match(/^(ST|LT|P)?(\d{3})(?:\/?(\d{2}))(?:ZR|R|D|B)?(\d{2,3}(?:\.\d)?)C?$/);
  if (m) {
    const parsed = metric(m[1] ?? "", Number(m[2]), Number(m[3]), parseRim(m[4]));
    if (parsed) return parsed;
  }

  // ---- digits only: 2256517 (7) / 29575225 (8, .5 rim) / 33125020 (8, flotation) ----
  if (/^\d{6,8}$/.test(compact)) {
    if (compact.length === 7) return metric("", +compact.slice(0, 3), +compact.slice(3, 5), +compact.slice(5, 7));
    if (compact.length === 8) {
      return (
        metric("", +compact.slice(0, 3), +compact.slice(3, 5), parseRim(compact.slice(5, 8))) ??
        flotation(+compact.slice(0, 2), +compact.slice(2, 6) / 100, +compact.slice(6, 8))
      );
    }
  }
  return null;
}

/**
 * Substrings to match against stored sizeSpec (case-insensitive `contains`).
 * Prefix is intentionally dropped for metric sizes so "2358016" also finds
 * "ST235/80R16"; multiple variants cover ".50"/".5" and rim notation.
 */
export function sizeNeedles(raw: string): string[] {
  const n = normalizeSizeInput(raw);
  if (!n) return [];
  if (n.kind === "metric") return [`${n.width}/${n.aspect}R${n.rim}`];
  if (n.kind === "truck") {
    const alt = Number.isInteger(n.rim) ? [] : [`${n.width}R${String(n.rim).replace(".", "")}`]; // 11R225 storage variant
    return [`${n.width}R${n.rim}`, ...alt];
  }
  const w2 = n.width.toFixed(2).replace(/0$/, ""); // 12.50 → 12.5
  const variants = new Set([`${n.diameter}X${n.width.toFixed(2)}R${n.rim}`, `${n.diameter}X${w2}R${n.rim}`, `${n.diameter}X${n.width}R${n.rim}`]);
  return [...variants];
}

/** Human suggestion for near-miss inputs ("did you mean…"). */
export function sizeSuggestion(raw: string): string | null {
  const compact = raw.trim().toUpperCase().replace(/[\s/-]/g, "");
  if (/^\d{5}$/.test(compact)) return "Tire sizes need width, aspect and rim — e.g. 225/65R17 or 2256517.";
  if (/^(ST|LT|P)?\d{3}\d{2}$/.test(compact)) return "Add the rim size — e.g. ST235/80R16.";
  return null;
}
