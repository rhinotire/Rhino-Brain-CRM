/**
 * The customers list's type / city / state filters, as a Prisma `where` fragment
 * (dealer-list activation spec section 8.6).
 *
 * Pure on purpose, and the location scope is a REQUIRED parameter: the page cannot
 * forget it and no filter value can widen it. The scope is spread LAST, and filter
 * values only ever land as leaves under their own `type` / `city` / `state` key, so a
 * crafted value cannot move or override `locationId` (Rhino FL and Everflow TX share
 * one database; a rep must never see the other company's customers).
 *
 * Imports nothing, on purpose: this file is reachable from app code and must stay
 * free of Prisma / fs / xlsx (a value import of those from anything a client
 * component reaches passes the build and crashes production at runtime).
 */

/** What the page's `locationScope(session)` returns. `{}` = no scoping (admin on "all", or a user with no location). */
export type CustomerLocationScope = { locationId?: string };

export type CustomerFilterInput<T extends string> = {
  /** The caller's company scope. Never widened, never narrowed here. */
  scope: CustomerLocationScope;
  /** Every value the `type` filter may take - pass the CustomerType enum so a future value is never unfilterable. */
  allowedTypes: readonly T[];
  /** Raw, untrusted query-string values. Anything that is not a non-blank string counts as "not set". */
  type?: unknown;
  city?: unknown;
  state?: unknown;
};

export type CustomerFilterWhere<T extends string> = CustomerLocationScope & {
  type?: T;
  city?: { equals: string; mode: "insensitive" };
  state?: { equals: string; mode: "insensitive" };
};

/** Backslash, which is Postgres' default LIKE escape character. */
const BACKSLASH = String.fromCharCode(92);

/**
 * Prisma compiles `{ equals, mode: "insensitive" }` to ILIKE, so a bare `%` or `_` in
 * the value is a wildcard (a city of "%" matches every customer). Escape them so the
 * value matches literally.
 */
function likeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, ch => BACKSLASH + ch);
}

/** A trimmed, non-empty string, or null. A repeated query param (string[]) is not a string. */
function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Match rules:
 * - type: exact, and only a value in `allowedTypes` (an unknown one is dropped, not
 *   passed to Prisma, which would throw on a bad enum).
 * - city, state: case-insensitive whole-value match (the data has "ORLANDO" and
 *   "Orlando", "TX" and "tx"), wildcards escaped.
 * - an absent or blank filter contributes nothing (never an empty-string match).
 */
export function buildCustomerFilterWhere<T extends string>(input: CustomerFilterInput<T>): CustomerFilterWhere<T> {
  const filters: CustomerFilterWhere<T> = {};

  const type = textOrNull(input.type);
  const allowed = type === null ? undefined : input.allowedTypes.find(t => t === type);
  if (allowed !== undefined) filters.type = allowed;

  const city = textOrNull(input.city);
  if (city !== null) filters.city = { equals: likeLiteral(city), mode: "insensitive" };

  const state = textOrNull(input.state);
  if (state !== null) filters.state = { equals: likeLiteral(state), mode: "insensitive" };

  // Scope last: whatever is above, the caller's location wins.
  return { ...filters, ...input.scope };
}

/** The State dropdown's choices: 50 states + DC + Puerto Rico (the CRM has PR customers). */
export const CUSTOMER_FILTER_STATES: readonly string[] = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY",
  "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH",
  "OK", "OR", "PA", "PR", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
];
