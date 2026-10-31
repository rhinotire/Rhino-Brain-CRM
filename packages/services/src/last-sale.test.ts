import { describe, expect, it } from "vitest";
import { CLEAR_WITHOUT_INVOICES_SQL, refreshLastSale, SET_FROM_INVOICES_SQL } from "./last-sale";

describe("last-sale SQL", () => {
  it("sets lastSaleAt from the newest invoice due date per customer", () => {
    expect(SET_FROM_INVOICES_SQL).toContain(`UPDATE "Customer"`);
    expect(SET_FROM_INVOICES_SQL).toContain(`MAX("dueDate")`);
    expect(SET_FROM_INVOICES_SQL).toContain(`GROUP BY "customerId"`);
  });

  it("ignores invoice rows with no customer link - they protect nobody", () => {
    expect(SET_FROM_INVOICES_SQL).toContain(`WHERE "customerId" IS NOT NULL`);
  });

  // Without this the statement rewrites every row on every A/R import.
  it("only touches rows whose value actually changes", () => {
    expect(SET_FROM_INVOICES_SQL).toContain("IS DISTINCT FROM");
  });

  // A/R import is a snapshot replace, so a customer really can stop having invoices.
  it("clears lastSaleAt for customers with no invoice left", () => {
    expect(CLEAR_WITHOUT_INVOICES_SQL).toContain(`SET "lastSaleAt" = NULL`);
    expect(CLEAR_WITHOUT_INVOICES_SQL).toContain("NOT IN");
  });

  it("never clears a row that is already null", () => {
    expect(CLEAR_WITHOUT_INVOICES_SQL).toContain(`"lastSaleAt" IS NOT NULL`);
  });

  it("writes to no table other than Customer", () => {
    for (const sql of [SET_FROM_INVOICES_SQL, CLEAR_WITHOUT_INVOICES_SQL]) {
      const writes = sql.match(/UPDATE\s+"(\w+)"/g) ?? [];
      expect(writes).toEqual([`UPDATE "Customer"`]);
      expect(sql).not.toMatch(/\b(DELETE|DROP|TRUNCATE|INSERT)\b/i);
    }
  });
});

describe("refreshLastSale", () => {
  const spyDb = () => {
    const calls: string[] = [];
    return {
      calls,
      db: {
        $executeRawUnsafe: async (sql: string) => {
          calls.push(sql);
          return calls.length === 1 ? 675 : 3;
        },
      },
    };
  };

  it("runs the set statement before the clear statement", async () => {
    const { db, calls } = spyDb();
    await refreshLastSale(db);
    expect(calls).toEqual([SET_FROM_INVOICES_SQL, CLEAR_WITHOUT_INVOICES_SQL]);
  });

  it("reports how many rows each statement changed", async () => {
    const { db } = spyDb();
    expect(await refreshLastSale(db)).toEqual({ set: 675, cleared: 3 });
  });
});
