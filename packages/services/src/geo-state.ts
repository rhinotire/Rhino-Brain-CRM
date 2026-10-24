/**
 * US state / Canadian province -> country. Leaf module: it must import
 * nothing, so client-reachable code can use it without pulling in xlsx or
 * node:fs (see dealer-list-parse.ts, which re-exports it).
 */

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
