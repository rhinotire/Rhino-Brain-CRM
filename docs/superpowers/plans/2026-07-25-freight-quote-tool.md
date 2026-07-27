# Freight Quote Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One-click freight quote blasts to carriers with AI-parsed reply comparison and one-click booking confirmation, per `docs/superpowers/specs/2026-07-25-freight-quote-tool-design.md`.

**Architecture:** New Prisma models + pure services in `packages/services` (email templates, AI reply parsing, reply routing) + server actions and pages in `apps/rhino-brain` under `/freight`. Mail transport is the dedicated Gmail box `luckywarehouse888@gmail.com` via **SMTP (nodemailer) for send and IMAP (imapflow) for reply polling, authenticated with a Gmail app password in env vars** — same env-based pattern as the existing Zoho `email.ts`. *(Amendment to spec §2: replaces the Gmail-API-OAuth `Mailbox` table — far less setup for the owner, same workflow; prospecting can reuse the identical pattern with its own env pair.)*

**Tech Stack:** Next.js 14 App Router, Prisma 5 (Supabase Postgres), vitest, nodemailer, imapflow + mailparser, `askClaudeJson` (existing plain-fetch Claude caller).

## Global Constraints

- pnpm workspace: services in `packages/services` (vitest, pure functions preferred), UI/actions in `apps/rhino-brain`.
- Company isolation: every shipment stores `locationId`; lists filter via `locationScope(session)` (`apps/rhino-brain/src/lib/auth.ts`). All freight actions require `requireManager()`.
- Carrier emails are in English. One email per carrier (its own contacts share the To line; carriers never see each other).
- Never guess a price: any parse failure / implausible value → quote status `NEEDS_ATTENTION` with raw excerpt kept.
- Per-carrier failure isolation: one failed send/parse never aborts a batch (prospecting lesson, commit d355516).
- refCode format: `RT-YYMM-NNN` (e.g. `RT-2607-001`), unique, NNN is a per-month counter.
- Default origin: `11423 Satellite Blvd, Orlando, FL 32837` (label "Orlando, FL"); editable per shipment.
- Env (server-only): `FREIGHT_GMAIL_USER=luckywarehouse888@gmail.com`, `FREIGHT_GMAIL_APP_PASS` (Gmail app password), `CRON_SECRET` (cron route auth). Missing env → no-op with console warning (pattern of `packages/services/src/email.ts`).
- Price plausibility window: 100–50 000 USD; transit days window: 1–21.

---

### Task 1: Prisma schema + migration + TMS seed script

**Files:**
- Modify: `packages/database/prisma/schema.prisma` (append freight section; add back-relations on `Location` and `User`)
- Create: `packages/database/scripts/seed-freight-carrier.ts`

**Interfaces:**
- Produces: models `FreightCarrier`, `FreightCarrierContact`, `FreightConsignee`, `FreightShipment`, `FreightShipmentStop`, `FreightQuote`; enums `FreightEquipment`, `FreightShipmentStatus`, `FreightQuoteStatus`. All later tasks use these exact names.

- [ ] **Step 1: Append freight models to schema.prisma**

Append at end of `packages/database/prisma/schema.prisma`:

```prisma
// ---------------- Freight quoting (docs/superpowers/specs/2026-07-25-freight-quote-tool-design.md) ----------------

enum FreightEquipment {
  DRY_VAN_53
  FLATBED_53
}

enum FreightShipmentStatus {
  QUOTING
  BOOKED
  PICKED_UP
  DELIVERED
  CANCELLED
}

enum FreightQuoteStatus {
  SENT
  QUOTED
  DECLINED
  NEEDS_ATTENTION
  SEND_FAILED
}

model FreightCarrier {
  id             String             @id @default(cuid())
  name           String
  phone          String?
  mcNumber       String?
  equipmentTypes FreightEquipment[]
  notes          String?
  active         Boolean            @default(true)
  createdAt      DateTime           @default(now())

  contacts FreightCarrierContact[]
  quotes   FreightQuote[]
}

model FreightCarrierContact {
  id        String         @id @default(cuid())
  carrierId String
  carrier   FreightCarrier @relation(fields: [carrierId], references: [id], onDelete: Cascade)
  name      String?
  email     String
  active    Boolean        @default(true)

  @@index([carrierId])
  @@index([email])
}

model FreightConsignee {
  id            String   @id @default(cuid())
  name          String // "Pearson GA – XXX Tire"
  addressLine   String
  city          String
  state         String
  zip           String
  contactName   String?
  phone         String?
  deliveryNotes String?
  active        Boolean  @default(true)
  createdAt     DateTime @default(now())

  stops FreightShipmentStop[]
}

model FreightShipment {
  id                 String                @id @default(cuid())
  refCode            String                @unique // RT-2607-001
  originAddress      String
  originLabel        String                @default("Orlando, FL") // for email subject
  equipmentType      FreightEquipment
  pickupDate         DateTime
  commodity          String                @default("tires")
  notes              String?
  status             FreightShipmentStatus @default(QUOTING)
  awardedQuoteId     String?               @unique // FreightQuote.id, no FK to avoid relation cycle
  confirmationSentAt DateTime?
  locationId         String?
  location           Location?             @relation(fields: [locationId], references: [id])
  createdById        String
  createdBy          User                  @relation(fields: [createdById], references: [id])
  createdAt          DateTime              @default(now())
  updatedAt          DateTime              @updatedAt

  stops  FreightShipmentStop[]
  quotes FreightQuote[]

  @@index([status])
  @@index([locationId])
}

model FreightShipmentStop {
  id          String           @id @default(cuid())
  shipmentId  String
  shipment    FreightShipment  @relation(fields: [shipmentId], references: [id], onDelete: Cascade)
  sequence    Int // 1..N drop order (user-specified)
  consigneeId String
  consignee   FreightConsignee @relation(fields: [consigneeId], references: [id])
  quantity    String? // free text: "250 tires / 4,800 lbs"
  notes       String?

  @@unique([shipmentId, sequence])
  @@index([consigneeId])
}

model FreightQuote {
  id              String             @id @default(cuid())
  shipmentId      String
  shipment        FreightShipment    @relation(fields: [shipmentId], references: [id], onDelete: Cascade)
  carrierId       String
  carrier         FreightCarrier     @relation(fields: [carrierId], references: [id])
  status          FreightQuoteStatus @default(SENT)
  price           Decimal?           @db.Decimal(10, 2)
  transitDays     Int?
  notes           String?
  rawReplyExcerpt String?
  parsedByAi      Boolean            @default(false)
  sentAt          DateTime?
  repliedAt       DateTime?
  lastError       String?

  @@unique([shipmentId, carrierId])
  @@index([status])
}
```

- [ ] **Step 2: Add back-relations**

In `model Location` (schema.prisma:222), add to the relation list:

```prisma
  freightShipments FreightShipment[]
```

In `model User`, add:

```prisma
  freightShipments FreightShipment[]
```

- [ ] **Step 3: Run migration**

```bash
cd packages/database && npx prisma migrate dev --name freight_quoting
```

Expected: migration created and applied, `prisma generate` runs. (If the pooled 6543 URL rejects DDL, migrations must use the session-mode/5432 `directUrl` already configured — see memory `supabase-vercel-db-config`.)

- [ ] **Step 4: Write TMS seed script**

Create `packages/database/scripts/seed-freight-carrier.ts` (idempotent upsert — safe on prod):

```ts
// One-off: seed the first carrier (TMS) per spec §8. Run:
//   cd packages/database && npx tsx scripts/seed-freight-carrier.ts
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const existing = await db.freightCarrier.findFirst({ where: { name: "TMS Transportation" } });
  if (existing) {
    console.log("TMS already seeded:", existing.id);
    return;
  }
  const carrier = await db.freightCarrier.create({
    data: {
      name: "TMS Transportation",
      equipmentTypes: ["DRY_VAN_53", "FLATBED_53"],
      contacts: {
        create: [
          { name: "Dayleen Marine", email: "dayleen.marine@tms-transportation.com" },
          { name: "Tim Sebacher", email: "tim.sebacher@tms-transportation.com" },
        ],
      },
    },
  });
  console.log("Seeded TMS:", carrier.id);
}

main().finally(() => db.$disconnect());
```

- [ ] **Step 5: Run seed script, verify**

```bash
cd packages/database && npx tsx scripts/seed-freight-carrier.ts
```

Expected: `Seeded TMS: <cuid>` (second run prints `TMS already seeded`).

- [ ] **Step 6: Commit**

```bash
git add packages/database/prisma packages/database/scripts/seed-freight-carrier.ts
git commit -m "feat(freight): schema — carriers, consignees, multi-stop shipments, quotes"
```

---

### Task 2: Email template builders (pure) + tests

**Files:**
- Create: `packages/services/src/freight-email-templates.ts`
- Test: `packages/services/src/freight-email-templates.test.ts`
- Modify: `packages/services/src/index.ts` (exports)

**Interfaces:**
- Produces:
  - `type FreightStopInfo = { sequence: number; name: string; addressLine: string; city: string; state: string; zip: string; contactName?: string | null; phone?: string | null; quantity?: string | null; notes?: string | null }`
  - `type FreightEmailInput = { refCode: string; originAddress: string; originLabel: string; equipment: "DRY_VAN_53" | "FLATBED_53"; pickupDateISO: string; commodity: string; stops: FreightStopInfo[]; notes?: string | null }`
  - `equipmentLabel(e): string` → `"53' Dry Van"` / `"53' Flatbed"`
  - `routeSummary(input): string` → `"Orlando, FL -> Pearson GA + Douglas GA (2 stops)"` (single stop omits the count)
  - `buildQuoteRequestEmail(input): { subject: string; body: string }`
  - `buildConfirmationEmail(input, award: { carrierName: string; contactName?: string | null; price: number }): { subject: string; body: string }`
  - `buildRegretEmail(input, carrierName: string): { subject: string; body: string }`

- [ ] **Step 1: Write the failing tests**

`packages/services/src/freight-email-templates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildQuoteRequestEmail,
  buildConfirmationEmail,
  buildRegretEmail,
  routeSummary,
  equipmentLabel,
  type FreightEmailInput,
} from "./freight-email-templates";

const base: FreightEmailInput = {
  refCode: "RT-2607-001",
  originAddress: "11423 Satellite Blvd, Orlando, FL 32837",
  originLabel: "Orlando, FL",
  equipment: "DRY_VAN_53",
  pickupDateISO: "2026-07-28",
  commodity: "tires",
  stops: [
    { sequence: 1, name: "Pearson GA – ABC Tire", addressLine: "100 Main St", city: "Pearson", state: "GA", zip: "31642", contactName: "Joe", phone: "912-555-0100", quantity: "250 tires" },
    { sequence: 2, name: "Douglas GA – XYZ Tire", addressLine: "200 Oak Ave", city: "Douglas", state: "GA", zip: "31533", quantity: "180 tires" },
  ],
};

describe("routeSummary / equipmentLabel", () => {
  it("multi-stop summary lists cities with stop count", () => {
    expect(routeSummary(base)).toBe("Orlando, FL -> Pearson GA + Douglas GA (2 stops)");
  });
  it("single stop omits the count", () => {
    expect(routeSummary({ ...base, stops: [base.stops[0]] })).toBe("Orlando, FL -> Pearson GA");
  });
  it("labels equipment", () => {
    expect(equipmentLabel("FLATBED_53")).toBe("53' Flatbed");
  });
});

describe("buildQuoteRequestEmail", () => {
  it("subject carries refCode, route, equipment", () => {
    const { subject } = buildQuoteRequestEmail(base);
    expect(subject).toBe("Rate Request RT-2607-001: Orlando, FL -> Pearson GA + Douglas GA (2 stops), 53' Dry Van");
  });
  it("body lists stops in order with addresses and quantities, asks for all-in rate", () => {
    const { body } = buildQuoteRequestEmail(base);
    const iStop1 = body.indexOf("Stop 1");
    const iStop2 = body.indexOf("Stop 2");
    expect(iStop1).toBeGreaterThan(-1);
    expect(iStop2).toBeGreaterThan(iStop1);
    expect(body).toContain("100 Main St, Pearson, GA 31642");
    expect(body).toContain("250 tires");
    expect(body).toContain("all-in rate");
    expect(body).toContain("drop fees");
  });
});

describe("buildConfirmationEmail", () => {
  it("contains price, pickup date, and every stop", () => {
    const { subject, body } = buildConfirmationEmail(base, { carrierName: "TMS Transportation", price: 2450 });
    expect(subject).toContain("RT-2607-001");
    expect(body).toContain("$2,450.00");
    expect(body).toContain("2026-07-28");
    expect(body).toContain("Douglas");
  });
});

describe("buildRegretEmail", () => {
  it("references the refCode and says covered", () => {
    const { body } = buildRegretEmail(base, "TMS Transportation");
    expect(body).toContain("RT-2607-001");
    expect(body.toLowerCase()).toContain("covered");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @rhino/services test -- freight-email-templates
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`packages/services/src/freight-email-templates.ts`:

```ts
/**
 * Pure email builders for the freight quote tool (spec §4). No transport deps
 * so previews and tests need no mail config.
 */
export type FreightStopInfo = {
  sequence: number;
  name: string;
  addressLine: string;
  city: string;
  state: string;
  zip: string;
  contactName?: string | null;
  phone?: string | null;
  quantity?: string | null;
  notes?: string | null;
};

export type FreightEmailInput = {
  refCode: string;
  originAddress: string;
  originLabel: string;
  equipment: "DRY_VAN_53" | "FLATBED_53";
  pickupDateISO: string; // YYYY-MM-DD
  commodity: string;
  stops: FreightStopInfo[];
  notes?: string | null;
};

export function equipmentLabel(e: FreightEmailInput["equipment"]): string {
  return e === "DRY_VAN_53" ? "53' Dry Van" : "53' Flatbed";
}

export function routeSummary(input: FreightEmailInput): string {
  const stops = [...input.stops].sort((a, b) => a.sequence - b.sequence);
  const cities = stops.map((s) => `${s.city} ${s.state}`).join(" + ");
  const count = stops.length > 1 ? ` (${stops.length} stops)` : "";
  return `${input.originLabel} -> ${cities}${count}`;
}

function stopLines(input: FreightEmailInput): string {
  return [...input.stops]
    .sort((a, b) => a.sequence - b.sequence)
    .map((s) => {
      const lines = [
        `Stop ${s.sequence}: ${s.name}`,
        `  ${s.addressLine}, ${s.city}, ${s.state} ${s.zip}`,
      ];
      if (s.quantity) lines.push(`  Quantity: ${s.quantity}`);
      if (s.contactName || s.phone) lines.push(`  Contact: ${[s.contactName, s.phone].filter(Boolean).join(", ")}`);
      if (s.notes) lines.push(`  Notes: ${s.notes}`);
      return lines.join("\n");
    })
    .join("\n\n");
}

export function buildQuoteRequestEmail(input: FreightEmailInput): { subject: string; body: string } {
  const subject = `Rate Request ${input.refCode}: ${routeSummary(input)}, ${equipmentLabel(input.equipment)}`;
  const multi = input.stops.length > 1;
  const body = [
    `Hello,`,
    ``,
    `We have a ${equipmentLabel(input.equipment)} load of ${input.commodity} and would like your best all-in rate${multi ? " (including all drop fees)" : ""}.`,
    ``,
    `Reference: ${input.refCode}`,
    `Pickup date: ${input.pickupDateISO}`,
    `Origin: ${input.originAddress}`,
    ``,
    `Delivery stops (in order):`,
    ``,
    stopLines(input),
    ``,
    ...(input.notes ? [`Notes: ${input.notes}`, ``] : []),
    `Please reply with your all-in rate, earliest pickup availability, and estimated transit time. Keep "${input.refCode}" in the subject line.`,
    ``,
    `Thank you,`,
    `Rhino Tire USA Logistics`,
  ].join("\n");
  return { subject, body };
}

const fmtUsd = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function buildConfirmationEmail(
  input: FreightEmailInput,
  award: { carrierName: string; contactName?: string | null; price: number }
): { subject: string; body: string } {
  const subject = `BOOKED ${input.refCode}: ${routeSummary(input)}, ${equipmentLabel(input.equipment)}`;
  const body = [
    `Hello${award.contactName ? ` ${award.contactName}` : ""},`,
    ``,
    `Confirming we would like to book this load with ${award.carrierName} at the agreed all-in rate of ${fmtUsd(award.price)}.`,
    ``,
    `Reference: ${input.refCode}`,
    `Pickup date: ${input.pickupDateISO}`,
    `Origin: ${input.originAddress}`,
    ``,
    `Delivery stops (in order):`,
    ``,
    stopLines(input),
    ``,
    `Please confirm receipt and send driver/dispatch details.`,
    ``,
    `Thank you,`,
    `Rhino Tire USA Logistics`,
  ].join("\n");
  return { subject, body };
}

export function buildRegretEmail(input: FreightEmailInput, carrierName: string): { subject: string; body: string } {
  return {
    subject: `Re: Rate Request ${input.refCode}`,
    body: [
      `Hello,`,
      ``,
      `Thank you for the quote on ${input.refCode}. This load has been covered. We appreciate the quick response and will keep ${carrierName} on our list for upcoming loads.`,
      ``,
      `Rhino Tire USA Logistics`,
    ].join("\n"),
  };
}
```

- [ ] **Step 4: Export from index.ts**

Add to `packages/services/src/index.ts`:

```ts
export {
  buildQuoteRequestEmail,
  buildConfirmationEmail,
  buildRegretEmail,
  routeSummary,
  equipmentLabel,
  type FreightEmailInput,
  type FreightStopInfo,
} from "./freight-email-templates";
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm --filter @rhino/services test -- freight-email-templates
```

Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/services/src/freight-email-templates.ts packages/services/src/freight-email-templates.test.ts packages/services/src/index.ts
git commit -m "feat(freight): pure email builders — quote request, confirmation, regret"
```

---

### Task 3: AI reply parsing + validation + tests

**Files:**
- Create: `packages/services/src/freight-parse.ts`
- Test: `packages/services/src/freight-parse.test.ts`
- Modify: `packages/services/src/index.ts`

**Interfaces:**
- Consumes: `askClaudeJson` from `./claude-json` (existing).
- Produces:
  - `type FreightReplyVerdict = "QUOTED" | "DECLINED" | "QUESTION" | "OTHER"`
  - `type ParsedFreightReply = { verdict: FreightReplyVerdict; price: number | null; transitDays: number | null; notes: string }`
  - `validateParsedReply(raw: unknown): ParsedFreightReply | null` — `null` means unusable → caller sets NEEDS_ATTENTION. A QUOTED verdict without a plausible price (100–50 000) is unusable: **never guess**.
  - `extractFreightQuote(emailText: string, ctx: { refCode: string; route: string; equipment: string }, ask?: typeof askClaudeJson): Promise<ParsedFreightReply | null>` — returns `null` on API/parse failure too (caller treats as NEEDS_ATTENTION).

- [ ] **Step 1: Write the failing tests**

`packages/services/src/freight-parse.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateParsedReply, extractFreightQuote } from "./freight-parse";

describe("validateParsedReply", () => {
  it("accepts a valid quote", () => {
    const r = validateParsedReply({ verdict: "QUOTED", price: 2450, transitDays: 2, notes: "fuel included" });
    expect(r).toEqual({ verdict: "QUOTED", price: 2450, transitDays: 2, notes: "fuel included" });
  });
  it("rejects QUOTED without a price (never guess)", () => {
    expect(validateParsedReply({ verdict: "QUOTED", price: null, transitDays: 2, notes: "" })).toBeNull();
  });
  it("rejects implausible price", () => {
    expect(validateParsedReply({ verdict: "QUOTED", price: 12, transitDays: 2, notes: "" })).toBeNull();
    expect(validateParsedReply({ verdict: "QUOTED", price: 999999, transitDays: 2, notes: "" })).toBeNull();
  });
  it("accepts DECLINED without price", () => {
    expect(validateParsedReply({ verdict: "DECLINED", price: null, transitDays: null, notes: "no trucks" })?.verdict).toBe("DECLINED");
  });
  it("nulls out-of-range transitDays but keeps the quote", () => {
    const r = validateParsedReply({ verdict: "QUOTED", price: 2450, transitDays: 45, notes: "" });
    expect(r?.price).toBe(2450);
    expect(r?.transitDays).toBeNull();
  });
  it("rejects unknown verdicts and garbage", () => {
    expect(validateParsedReply({ verdict: "MAYBE", price: 100, transitDays: 1, notes: "" })).toBeNull();
    expect(validateParsedReply("not an object")).toBeNull();
    expect(validateParsedReply(null)).toBeNull();
  });
  it("truncates long notes to 500 chars", () => {
    const r = validateParsedReply({ verdict: "QUESTION", price: null, transitDays: null, notes: "x".repeat(900) });
    expect(r?.notes.length).toBe(500);
  });
});

describe("extractFreightQuote", () => {
  const ctx = { refCode: "RT-2607-001", route: "Orlando, FL -> Pearson GA", equipment: "53' Dry Van" };
  it("passes email text through the ask function and validates", async () => {
    const fakeAsk = async () => ({ json: { verdict: "QUOTED", price: 1875.5, transitDays: 1, notes: "" }, inputTokens: 1, outputTokens: 1 });
    const r = await extractFreightQuote("We can do $1875.50, next-day", ctx, fakeAsk as any);
    expect(r?.price).toBe(1875.5);
  });
  it("returns null when the API throws", async () => {
    const fakeAsk = async () => { throw new Error("boom"); };
    expect(await extractFreightQuote("hi", ctx, fakeAsk as any)).toBeNull();
  });
  it("returns null when the model returns junk", async () => {
    const fakeAsk = async () => ({ json: { verdict: "QUOTED", price: "call me" }, inputTokens: 1, outputTokens: 1 });
    expect(await extractFreightQuote("hi", ctx, fakeAsk as any)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @rhino/services test -- freight-parse
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`packages/services/src/freight-parse.ts`:

```ts
/**
 * AI extraction of carrier quote replies (spec §4). Field-level validation
 * mirrors the prospecting lesson (commit e70667e): a QUOTED verdict without a
 * plausible price is unusable — the system never guesses a price.
 */
import { askClaudeJson } from "./claude-json";

export type FreightReplyVerdict = "QUOTED" | "DECLINED" | "QUESTION" | "OTHER";
export type ParsedFreightReply = {
  verdict: FreightReplyVerdict;
  price: number | null;
  transitDays: number | null;
  notes: string;
};

const VERDICTS: FreightReplyVerdict[] = ["QUOTED", "DECLINED", "QUESTION", "OTHER"];
const PRICE_MIN = 100;
const PRICE_MAX = 50_000;
const TRANSIT_MIN = 1;
const TRANSIT_MAX = 21;

export function validateParsedReply(raw: unknown): ParsedFreightReply | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const verdict = o.verdict;
  if (typeof verdict !== "string" || !VERDICTS.includes(verdict as FreightReplyVerdict)) return null;

  let price: number | null = null;
  if (typeof o.price === "number" && Number.isFinite(o.price)) price = o.price;
  if (verdict === "QUOTED" && (price === null || price < PRICE_MIN || price > PRICE_MAX)) return null;
  if (verdict !== "QUOTED") price = null;

  let transitDays: number | null = null;
  if (typeof o.transitDays === "number" && Number.isInteger(o.transitDays) && o.transitDays >= TRANSIT_MIN && o.transitDays <= TRANSIT_MAX) {
    transitDays = o.transitDays;
  }

  const notes = typeof o.notes === "string" ? o.notes.slice(0, 500) : "";
  return { verdict: verdict as FreightReplyVerdict, price, transitDays, notes };
}

const SYSTEM = `You extract structured data from freight carrier email replies for a tire wholesaler.
Reply with ONLY a JSON object, no prose: {"verdict":"QUOTED"|"DECLINED"|"QUESTION"|"OTHER","price":number|null,"transitDays":number|null,"notes":string}
- QUOTED: the carrier gave a concrete all-in USD rate for the load. price = that total rate as a number.
- DECLINED: the carrier cannot take the load.
- QUESTION: the carrier asks for more information before quoting.
- OTHER: anything else (auto-reply, unrelated).
- transitDays: estimated door-to-door days if stated, else null.
- notes: one short sentence of useful context (fuel included, pickup window, the question asked...).
Never invent a price. If no explicit total rate is present, verdict is not QUOTED.`;

export async function extractFreightQuote(
  emailText: string,
  ctx: { refCode: string; route: string; equipment: string },
  ask: typeof askClaudeJson = askClaudeJson
): Promise<ParsedFreightReply | null> {
  try {
    const { json } = await ask({
      system: SYSTEM,
      user: `Load ${ctx.refCode} (${ctx.route}, ${ctx.equipment}). Carrier reply:\n\n${emailText.slice(0, 6000)}`,
      maxTokens: 300,
    });
    return validateParsedReply(json);
  } catch (e) {
    console.error("[freight-parse] extraction failed:", e instanceof Error ? e.message : e);
    return null;
  }
}
```

- [ ] **Step 4: Export from index.ts**

```ts
export { validateParsedReply, extractFreightQuote, type ParsedFreightReply, type FreightReplyVerdict } from "./freight-parse";
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm --filter @rhino/services test -- freight-parse
```

Expected: PASS (10 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/services/src/freight-parse.ts packages/services/src/freight-parse.test.ts packages/services/src/index.ts
git commit -m "feat(freight): AI quote extraction with never-guess price validation"
```

---

### Task 4: refCode helper, reply handler, Gmail transport (SMTP + IMAP)

**Files:**
- Create: `packages/services/src/freight-refcode.ts`
- Create: `packages/services/src/freight-reply-handler.ts`
- Create: `packages/services/src/freight-mailer.ts`
- Create: `packages/services/src/freight-inbox.ts`
- Test: `packages/services/src/freight-refcode.test.ts`, `packages/services/src/freight-reply-handler.test.ts`
- Modify: `packages/services/src/index.ts`, `packages/services/package.json` (deps)

**Interfaces:**
- Consumes: `extractFreightQuote` (Task 3).
- Produces:
  - `refCodePrefix(d: Date): string` → `"RT-2607-"`; `nextRefCode(prefix: string, latest: string | null): string`
  - `handleFreightReply(msg: { subject: string; fromEmail: string; text: string }, deps?): Promise<{ handled: boolean; reason?: string }>` — deps `{ db, extract }` injectable for tests; default db = `@rhino/database` client.
  - `isFreightMailConfigured(): boolean`; `sendFreightEmail(to: string[], subject: string, text: string): Promise<{ sent: boolean; error?: string }>`
  - `pollFreightInbox(): Promise<{ processed: number; matched: number }>`

- [ ] **Step 1: Add dependencies**

```bash
pnpm --filter @rhino/services add imapflow mailparser && pnpm --filter @rhino/services add -D @types/mailparser
```

- [ ] **Step 2: Write the failing refCode tests**

`packages/services/src/freight-refcode.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { refCodePrefix, nextRefCode } from "./freight-refcode";

describe("refCodePrefix", () => {
  it("builds RT-YYMM- from a date", () => {
    expect(refCodePrefix(new Date("2026-07-25T12:00:00Z"))).toBe("RT-2607-");
    expect(refCodePrefix(new Date("2026-01-05T12:00:00Z"))).toBe("RT-2601-");
  });
});

describe("nextRefCode", () => {
  it("starts at 001 for a fresh month", () => {
    expect(nextRefCode("RT-2607-", null)).toBe("RT-2607-001");
  });
  it("increments the latest", () => {
    expect(nextRefCode("RT-2607-", "RT-2607-007")).toBe("RT-2607-008");
  });
  it("crosses 099 -> 100 without padding bugs", () => {
    expect(nextRefCode("RT-2607-", "RT-2607-099")).toBe("RT-2607-100");
  });
});
```

- [ ] **Step 3: Implement freight-refcode.ts**

```ts
/** Shipment reference codes: RT-YYMM-NNN, NNN a per-month counter (spec §3). */
export function refCodePrefix(d: Date): string {
  const yy = String(d.getUTCFullYear()).slice(2);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `RT-${yy}${mm}-`;
}

export function nextRefCode(prefix: string, latest: string | null): string {
  const n = latest ? parseInt(latest.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(n).padStart(3, "0")}`;
}
```

- [ ] **Step 4: Write the failing reply-handler tests**

`packages/services/src/freight-reply-handler.test.ts` (fake db + fake extractor — no network, no Postgres):

```ts
import { describe, expect, it } from "vitest";
import { handleFreightReply } from "./freight-reply-handler";

function fakeDb(overrides: { shipment?: any; updates?: any[] }) {
  const updates: any[] = overrides.updates ?? [];
  return {
    updates,
    db: {
      freightShipment: {
        findUnique: async () => overrides.shipment ?? null,
      },
      freightQuote: {
        update: async (args: any) => { updates.push(args); return {}; },
      },
    } as any,
  };
}

const shipment = {
  id: "s1",
  refCode: "RT-2607-001",
  originLabel: "Orlando, FL",
  equipmentType: "DRY_VAN_53",
  stops: [{ sequence: 1, consignee: { city: "Pearson", state: "GA" } }],
  quotes: [
    {
      id: "q1",
      status: "SENT",
      carrier: { name: "TMS", contacts: [{ email: "dayleen.marine@tms-transportation.com", active: true }] },
    },
  ],
};

const msg = { subject: "Re: Rate Request RT-2607-001: ...", fromEmail: "dayleen.marine@tms-transportation.com", text: "We can do $2450 all in, 1 day transit" };

describe("handleFreightReply", () => {
  it("ignores mail without a refCode in the subject", async () => {
    const { db } = fakeDb({});
    const r = await handleFreightReply({ ...msg, subject: "Newsletter" }, { db, extract: async () => null });
    expect(r).toEqual({ handled: false, reason: "no refCode" });
  });
  it("ignores refCodes with no shipment", async () => {
    const { db } = fakeDb({ shipment: null });
    const r = await handleFreightReply(msg, { db, extract: async () => null });
    expect(r.handled).toBe(false);
  });
  it("ignores senders that match no carrier contact", async () => {
    const { db } = fakeDb({ shipment });
    const r = await handleFreightReply({ ...msg, fromEmail: "stranger@spam.com" }, { db, extract: async () => null });
    expect(r).toEqual({ handled: false, reason: "sender not a carrier contact" });
  });
  it("stores a validated quote", async () => {
    const { db, updates } = fakeDb({ shipment });
    const r = await handleFreightReply(msg, {
      db,
      extract: async () => ({ verdict: "QUOTED", price: 2450, transitDays: 1, notes: "all in" }),
    });
    expect(r.handled).toBe(true);
    expect(updates[0].where).toEqual({ id: "q1" });
    expect(updates[0].data.status).toBe("QUOTED");
    expect(updates[0].data.price).toBe(2450);
    expect(updates[0].data.parsedByAi).toBe(true);
    expect(updates[0].data.rawReplyExcerpt).toContain("$2450");
  });
  it("marks NEEDS_ATTENTION when extraction returns null", async () => {
    const { db, updates } = fakeDb({ shipment });
    await handleFreightReply(msg, { db, extract: async () => null });
    expect(updates[0].data.status).toBe("NEEDS_ATTENTION");
    expect(updates[0].data.price).toBeUndefined();
  });
  it("maps QUESTION to NEEDS_ATTENTION", async () => {
    const { db, updates } = fakeDb({ shipment });
    await handleFreightReply(msg, { db, extract: async () => ({ verdict: "QUESTION", price: null, transitDays: null, notes: "what weight?" }) });
    expect(updates[0].data.status).toBe("NEEDS_ATTENTION");
    expect(updates[0].data.notes).toBe("what weight?");
  });
});
```

- [ ] **Step 5: Implement freight-reply-handler.ts**

```ts
/**
 * Routes one inbound email to its FreightQuote row (spec §4): refCode in the
 * subject finds the shipment; the From address must match one of that
 * shipment's carrier contacts. Unmatched mail is skipped, never guessed at.
 */
import { db as defaultDb } from "@rhino/database";
import { extractFreightQuote, type ParsedFreightReply } from "./freight-parse";
import { equipmentLabel } from "./freight-email-templates";

const REF_RE = /RT-\d{4}-\d{3}/;

type Deps = {
  db?: any;
  extract?: (text: string, ctx: { refCode: string; route: string; equipment: string }) => Promise<ParsedFreightReply | null>;
};

export async function handleFreightReply(
  msg: { subject: string; fromEmail: string; text: string },
  deps: Deps = {}
): Promise<{ handled: boolean; reason?: string }> {
  const db = deps.db ?? defaultDb;
  const extract = deps.extract ?? extractFreightQuote;

  const refCode = msg.subject.match(REF_RE)?.[0];
  if (!refCode) return { handled: false, reason: "no refCode" };

  const shipment = await db.freightShipment.findUnique({
    where: { refCode },
    include: {
      stops: { include: { consignee: true }, orderBy: { sequence: "asc" } },
      quotes: { include: { carrier: { include: { contacts: true } } } },
    },
  });
  if (!shipment) return { handled: false, reason: "unknown refCode" };

  const from = msg.fromEmail.toLowerCase();
  const quote = shipment.quotes.find((q: any) =>
    q.carrier.contacts.some((c: any) => c.email.toLowerCase() === from)
  );
  if (!quote) return { handled: false, reason: "sender not a carrier contact" };

  const route = `${shipment.originLabel} -> ${shipment.stops.map((s: any) => `${s.consignee.city} ${s.consignee.state}`).join(" + ")}`;
  const parsed = await extract(msg.text, { refCode, route, equipment: equipmentLabel(shipment.equipmentType) });

  const base = {
    repliedAt: new Date(),
    rawReplyExcerpt: msg.text.slice(0, 1000),
    parsedByAi: parsed !== null,
  };
  if (parsed === null) {
    await db.freightQuote.update({ where: { id: quote.id }, data: { ...base, status: "NEEDS_ATTENTION" } });
  } else if (parsed.verdict === "QUOTED") {
    await db.freightQuote.update({
      where: { id: quote.id },
      data: { ...base, status: "QUOTED", price: parsed.price, transitDays: parsed.transitDays, notes: parsed.notes || null },
    });
  } else if (parsed.verdict === "DECLINED") {
    await db.freightQuote.update({ where: { id: quote.id }, data: { ...base, status: "DECLINED", notes: parsed.notes || null } });
  } else {
    await db.freightQuote.update({ where: { id: quote.id }, data: { ...base, status: "NEEDS_ATTENTION", notes: parsed.notes || null } });
  }
  return { handled: true };
}
```

*(Check `@rhino/database` exposes `db`; if the package exports `PrismaClient` differently, match the import style used by `packages/services/src/referral-maintenance.ts`.)*

- [ ] **Step 6: Implement freight-mailer.ts (SMTP send)**

```ts
import nodemailer from "nodemailer";

/**
 * Freight mail transport: dedicated Gmail box via app password (spec §2
 * amendment — same env-based pattern as email.ts/Zoho).
 * Env: FREIGHT_GMAIL_USER (luckywarehouse888@gmail.com), FREIGHT_GMAIL_APP_PASS.
 * Missing env → no-op with a warning so dev environments never send mail.
 */
const USER = process.env.FREIGHT_GMAIL_USER;
const PASS = process.env.FREIGHT_GMAIL_APP_PASS;

export function isFreightMailConfigured(): boolean {
  return Boolean(USER && PASS);
}

export async function sendFreightEmail(to: string[], subject: string, text: string): Promise<{ sent: boolean; error?: string }> {
  if (!USER || !PASS) {
    console.warn(`[freight-mailer] not configured — skipped "${subject}" to ${to.join(", ")}`);
    return { sent: false, error: "mail not configured" };
  }
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: USER, pass: PASS },
  });
  try {
    await transporter.sendMail({ from: `"Rhino Tire USA Logistics" <${USER}>`, to: to.join(", "), subject, text });
    return { sent: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[freight-mailer] send failed:", error);
    return { sent: false, error };
  }
}
```

- [ ] **Step 7: Implement freight-inbox.ts (IMAP poll)**

```ts
/**
 * Polls the freight Gmail inbox for unseen mail and routes each message
 * through handleFreightReply. Messages are marked \Seen whether or not they
 * matched (a dedicated box: unmatched mail is just noise). Per-message
 * try/catch — one bad email never stalls the rest (spec §6).
 */
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { handleFreightReply } from "./freight-reply-handler";

export async function pollFreightInbox(
  handle: typeof handleFreightReply = handleFreightReply
): Promise<{ processed: number; matched: number }> {
  const user = process.env.FREIGHT_GMAIL_USER;
  const pass = process.env.FREIGHT_GMAIL_APP_PASS;
  if (!user || !pass) {
    console.warn("[freight-inbox] not configured — poll skipped");
    return { processed: 0, matched: 0 };
  }

  const client = new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: { user, pass }, logger: false });
  let processed = 0;
  let matched = 0;
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const unseen = await client.search({ seen: false });
      for (const uid of unseen ?? []) {
        try {
          const raw = await client.download(String(uid), undefined, { uid: true });
          const parsed = await simpleParser(raw.content);
          const fromEmail = parsed.from?.value?.[0]?.address?.toLowerCase() ?? "";
          const result = await handle({
            subject: parsed.subject ?? "",
            fromEmail,
            text: parsed.text ?? "",
          });
          if (result.handled) matched++;
        } catch (e) {
          console.error(`[freight-inbox] message ${uid} failed:`, e instanceof Error ? e.message : e);
        } finally {
          processed++;
          await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true }).catch(() => {});
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
  return { processed, matched };
}
```

- [ ] **Step 8: Export all from index.ts**

```ts
export { refCodePrefix, nextRefCode } from "./freight-refcode";
export { handleFreightReply } from "./freight-reply-handler";
export { isFreightMailConfigured, sendFreightEmail } from "./freight-mailer";
export { pollFreightInbox } from "./freight-inbox";
```

- [ ] **Step 9: Run the full services test suite**

```bash
pnpm --filter @rhino/services test
```

Expected: PASS including the 3 refcode + 6 reply-handler tests; no existing tests broken.

- [ ] **Step 10: Commit**

```bash
git add packages/services
git commit -m "feat(freight): refCode, reply routing, Gmail SMTP/IMAP transport"
```

---

### Task 5: Server actions

**Files:**
- Create: `apps/rhino-brain/src/actions/freight.ts`

**Interfaces:**
- Consumes (from `@rhino/services`): `buildQuoteRequestEmail`, `buildConfirmationEmail`, `buildRegretEmail`, `sendFreightEmail`, `pollFreightInbox`, `refCodePrefix`, `nextRefCode`, types `FreightEmailInput`, `FreightStopInfo`.
- Produces (used by Task 7 UI):
  - `saveCarrier(input)`, `deleteCarrier(id)`, `saveConsignee(input)`, `deleteConsignee(id)`
  - `previewQuoteEmail(input: ShipmentInput)` → `{ subject, body }`
  - `createShipmentAndSend(input: ShipmentInput)` → `{ ok, shipmentId?, error? }`
  - `awardQuote(quoteId, opts: { sendRegrets: boolean })`, `resendQuote(quoteId)`, `resendConfirmation(shipmentId)`
  - `updateShipmentStatus(shipmentId, to)`, `overrideQuote(quoteId, { price, transitDays? })`, `checkRepliesNow()`

- [ ] **Step 1: Implement `apps/rhino-brain/src/actions/freight.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  buildQuoteRequestEmail,
  buildConfirmationEmail,
  buildRegretEmail,
  sendFreightEmail,
  pollFreightInbox,
  refCodePrefix,
  nextRefCode,
  type FreightEmailInput,
  type FreightStopInfo,
} from "@rhino/services";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/auth";

// ---------- carriers / consignees ----------

const contactSchema = z.object({ id: z.string().optional(), name: z.string().optional(), email: z.string().email(), active: z.boolean().default(true) });
const carrierSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  phone: z.string().optional(),
  mcNumber: z.string().optional(),
  equipmentTypes: z.array(z.enum(["DRY_VAN_53", "FLATBED_53"])).min(1),
  notes: z.string().optional(),
  active: z.boolean().default(true),
  contacts: z.array(contactSchema).min(1),
});

export async function saveCarrier(raw: unknown): Promise<{ ok: boolean; error?: string }> {
  await requireManager();
  const p = carrierSchema.safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const { id, contacts, ...data } = p.data;
  if (id) {
    await db.$transaction([
      db.freightCarrier.update({ where: { id }, data }),
      db.freightCarrierContact.deleteMany({ where: { carrierId: id, id: { notIn: contacts.filter((c) => c.id).map((c) => c.id!) } } }),
      ...contacts.map((c) =>
        c.id
          ? db.freightCarrierContact.update({ where: { id: c.id }, data: { name: c.name || null, email: c.email, active: c.active } })
          : db.freightCarrierContact.create({ data: { carrierId: id, name: c.name || null, email: c.email, active: c.active } })
      ),
    ]);
  } else {
    await db.freightCarrier.create({ data: { ...data, contacts: { create: contacts.map((c) => ({ name: c.name || null, email: c.email, active: c.active })) } } });
  }
  revalidatePath("/freight/carriers");
  return { ok: true };
}

export async function deleteCarrier(id: string): Promise<{ ok: boolean; error?: string }> {
  await requireManager();
  const used = await db.freightQuote.count({ where: { carrierId: id } });
  if (used > 0) {
    await db.freightCarrier.update({ where: { id }, data: { active: false } }); // keep history, hide from new blasts
  } else {
    await db.freightCarrier.delete({ where: { id } });
  }
  revalidatePath("/freight/carriers");
  return { ok: true };
}

const consigneeSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  addressLine: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(2).max(2),
  zip: z.string().min(5),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  deliveryNotes: z.string().optional(),
  active: z.boolean().default(true),
});

export async function saveConsignee(raw: unknown): Promise<{ ok: boolean; error?: string }> {
  await requireManager();
  const p = consigneeSchema.safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const { id, ...data } = p.data;
  const clean = { ...data, contactName: data.contactName || null, phone: data.phone || null, deliveryNotes: data.deliveryNotes || null };
  if (id) await db.freightConsignee.update({ where: { id }, data: clean });
  else await db.freightConsignee.create({ data: clean });
  revalidatePath("/freight/consignees");
  return { ok: true };
}

export async function deleteConsignee(id: string): Promise<{ ok: boolean }> {
  await requireManager();
  const used = await db.freightShipmentStop.count({ where: { consigneeId: id } });
  if (used > 0) await db.freightConsignee.update({ where: { id }, data: { active: false } });
  else await db.freightConsignee.delete({ where: { id } });
  revalidatePath("/freight/consignees");
  return { ok: true };
}

// ---------- shipments ----------

const shipmentSchema = z.object({
  originAddress: z.string().min(5),
  originLabel: z.string().min(2),
  equipmentType: z.enum(["DRY_VAN_53", "FLATBED_53"]),
  pickupDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  commodity: z.string().default("tires"),
  notes: z.string().optional(),
  stops: z.array(z.object({ consigneeId: z.string(), quantity: z.string().optional(), notes: z.string().optional() })).min(1),
  carrierIds: z.array(z.string()).min(1),
});
export type ShipmentInput = z.infer<typeof shipmentSchema>;

async function emailInputFor(input: ShipmentInput, refCode: string): Promise<FreightEmailInput> {
  const consignees = await db.freightConsignee.findMany({ where: { id: { in: input.stops.map((s) => s.consigneeId) } } });
  const byId = new Map(consignees.map((c) => [c.id, c]));
  const stops: FreightStopInfo[] = input.stops.map((s, i) => {
    const c = byId.get(s.consigneeId);
    if (!c) throw new Error("Unknown consignee");
    return {
      sequence: i + 1,
      name: c.name,
      addressLine: c.addressLine,
      city: c.city,
      state: c.state,
      zip: c.zip,
      contactName: c.contactName,
      phone: c.phone,
      quantity: s.quantity || null,
      notes: s.notes || c.deliveryNotes || null,
    };
  });
  return {
    refCode,
    originAddress: input.originAddress,
    originLabel: input.originLabel,
    equipment: input.equipmentType,
    pickupDateISO: input.pickupDate,
    commodity: input.commodity,
    stops,
    notes: input.notes || null,
  };
}

/** Preview for the /freight/new form — same builder the real send uses. */
export async function previewQuoteEmail(raw: unknown): Promise<{ subject: string; body: string; error?: string }> {
  await requireManager();
  const p = shipmentSchema.safeParse(raw);
  if (!p.success) return { subject: "", body: "", error: p.error.issues[0].message };
  const emailInput = await emailInputFor(p.data, "RT-XXXX-XXX (assigned on send)");
  return buildQuoteRequestEmail(emailInput);
}

export async function createShipmentAndSend(raw: unknown): Promise<{ ok: boolean; shipmentId?: string; error?: string }> {
  const session = await requireManager();
  const p = shipmentSchema.safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const input = p.data;

  const prefix = refCodePrefix(new Date());
  const latest = await db.freightShipment.findFirst({
    where: { refCode: { startsWith: prefix } },
    orderBy: { refCode: "desc" },
    select: { refCode: true },
  });
  const refCode = nextRefCode(prefix, latest?.refCode ?? null);

  const shipment = await db.freightShipment.create({
    data: {
      refCode,
      originAddress: input.originAddress,
      originLabel: input.originLabel,
      equipmentType: input.equipmentType,
      pickupDate: new Date(`${input.pickupDate}T12:00:00Z`),
      commodity: input.commodity,
      notes: input.notes || null,
      locationId: session.locationId ?? null,
      createdById: session.userId,
      stops: { create: input.stops.map((s, i) => ({ sequence: i + 1, consigneeId: s.consigneeId, quantity: s.quantity || null, notes: s.notes || null })) },
    },
  });

  const emailInput = await emailInputFor(input, refCode);
  const { subject, body } = buildQuoteRequestEmail(emailInput);
  const carriers = await db.freightCarrier.findMany({
    where: { id: { in: input.carrierIds } },
    include: { contacts: { where: { active: true } } },
  });

  // Per-carrier isolation: one bad address/SMTP hiccup never kills the batch.
  for (const carrier of carriers) {
    const to = carrier.contacts.map((c) => c.email);
    if (to.length === 0) {
      await db.freightQuote.create({ data: { shipmentId: shipment.id, carrierId: carrier.id, status: "SEND_FAILED", lastError: "no active contact email" } });
      continue;
    }
    try {
      const r = await sendFreightEmail(to, subject, body);
      await db.freightQuote.create({
        data: r.sent
          ? { shipmentId: shipment.id, carrierId: carrier.id, status: "SENT", sentAt: new Date() }
          : { shipmentId: shipment.id, carrierId: carrier.id, status: "SEND_FAILED", lastError: r.error ?? "send failed" },
      });
    } catch (e) {
      await db.freightQuote.create({
        data: { shipmentId: shipment.id, carrierId: carrier.id, status: "SEND_FAILED", lastError: e instanceof Error ? e.message : "send failed" },
      });
    }
  }

  revalidatePath("/freight");
  return { ok: true, shipmentId: shipment.id };
}

export async function resendQuote(quoteId: string): Promise<{ ok: boolean; error?: string }> {
  await requireManager();
  const quote = await db.freightQuote.findUnique({
    where: { id: quoteId },
    include: { carrier: { include: { contacts: { where: { active: true } } } }, shipment: { include: { stops: { include: { consignee: true }, orderBy: { sequence: "asc" } } } } },
  });
  if (!quote || quote.status !== "SEND_FAILED") return { ok: false, error: "Not a failed quote" };
  const s = quote.shipment;
  const emailInput: FreightEmailInput = {
    refCode: s.refCode,
    originAddress: s.originAddress,
    originLabel: s.originLabel,
    equipment: s.equipmentType,
    pickupDateISO: s.pickupDate.toISOString().slice(0, 10),
    commodity: s.commodity,
    notes: s.notes,
    stops: s.stops.map((st) => ({
      sequence: st.sequence, name: st.consignee.name, addressLine: st.consignee.addressLine, city: st.consignee.city,
      state: st.consignee.state, zip: st.consignee.zip, contactName: st.consignee.contactName, phone: st.consignee.phone,
      quantity: st.quantity, notes: st.notes ?? st.consignee.deliveryNotes,
    })),
  };
  const { subject, body } = buildQuoteRequestEmail(emailInput);
  const to = quote.carrier.contacts.map((c) => c.email);
  if (to.length === 0) return { ok: false, error: "Carrier has no active contact email" };
  const r = await sendFreightEmail(to, subject, body);
  await db.freightQuote.update({
    where: { id: quoteId },
    data: r.sent ? { status: "SENT", sentAt: new Date(), lastError: null } : { lastError: r.error ?? "send failed" },
  });
  revalidatePath(`/freight/${s.id}`);
  return r.sent ? { ok: true } : { ok: false, error: r.error };
}

export async function awardQuote(quoteId: string, opts: { sendRegrets: boolean }): Promise<{ ok: boolean; error?: string }> {
  await requireManager();
  const quote = await db.freightQuote.findUnique({
    where: { id: quoteId },
    include: { carrier: { include: { contacts: { where: { active: true } } } }, shipment: { include: { stops: { include: { consignee: true }, orderBy: { sequence: "asc" } }, quotes: { include: { carrier: { include: { contacts: { where: { active: true } } } } } } } } },
  });
  if (!quote) return { ok: false, error: "Quote not found" };
  if (quote.status !== "QUOTED") return { ok: false, error: "Carrier has not quoted yet" };
  if (quote.price === null) return { ok: false, error: "Quote has no price" };

  // Race guard: only one award per shipment (same updateMany-count pattern as calibrateLead).
  const { count } = await db.freightShipment.updateMany({
    where: { id: quote.shipmentId, status: "QUOTING" },
    data: { status: "BOOKED", awardedQuoteId: quote.id },
  });
  if (count !== 1) return { ok: false, error: "Shipment already booked or not quotable" };

  const s = quote.shipment;
  const emailInput: FreightEmailInput = {
    refCode: s.refCode,
    originAddress: s.originAddress,
    originLabel: s.originLabel,
    equipment: s.equipmentType,
    pickupDateISO: s.pickupDate.toISOString().slice(0, 10),
    commodity: s.commodity,
    notes: s.notes,
    stops: s.stops.map((st) => ({
      sequence: st.sequence, name: st.consignee.name, addressLine: st.consignee.addressLine, city: st.consignee.city,
      state: st.consignee.state, zip: st.consignee.zip, contactName: st.consignee.contactName, phone: st.consignee.phone,
      quantity: st.quantity, notes: st.notes ?? st.consignee.deliveryNotes,
    })),
  };
  const conf = buildConfirmationEmail(emailInput, {
    carrierName: quote.carrier.name,
    contactName: quote.carrier.contacts[0]?.name,
    price: Number(quote.price),
  });
  const to = quote.carrier.contacts.map((c) => c.email);
  const r = to.length > 0 ? await sendFreightEmail(to, conf.subject, conf.body) : { sent: false, error: "no active contact" };
  if (r.sent) await db.freightShipment.update({ where: { id: s.id }, data: { confirmationSentAt: new Date() } });

  if (opts.sendRegrets) {
    for (const other of s.quotes) {
      if (other.id === quote.id || other.status !== "QUOTED") continue;
      const otherTo = other.carrier.contacts.map((c) => c.email);
      if (otherTo.length === 0) continue;
      const regret = buildRegretEmail(emailInput, other.carrier.name);
      await sendFreightEmail(otherTo, regret.subject, regret.body).catch(() => {});
    }
  }

  revalidatePath(`/freight/${s.id}`);
  revalidatePath("/freight");
  return r.sent ? { ok: true } : { ok: false, error: `Booked, but confirmation email failed: ${r.error}. Use "Resend confirmation".` };
}

export async function resendConfirmation(shipmentId: string): Promise<{ ok: boolean; error?: string }> {
  await requireManager();
  const s = await db.freightShipment.findUnique({
    where: { id: shipmentId },
    include: { stops: { include: { consignee: true }, orderBy: { sequence: "asc" } }, quotes: { include: { carrier: { include: { contacts: { where: { active: true } } } } } } },
  });
  if (!s || s.status !== "BOOKED" || !s.awardedQuoteId) return { ok: false, error: "Shipment is not booked" };
  const quote = s.quotes.find((q) => q.id === s.awardedQuoteId);
  if (!quote || quote.price === null) return { ok: false, error: "Awarded quote missing" };
  const emailInput: FreightEmailInput = {
    refCode: s.refCode, originAddress: s.originAddress, originLabel: s.originLabel, equipment: s.equipmentType,
    pickupDateISO: s.pickupDate.toISOString().slice(0, 10), commodity: s.commodity, notes: s.notes,
    stops: s.stops.map((st) => ({
      sequence: st.sequence, name: st.consignee.name, addressLine: st.consignee.addressLine, city: st.consignee.city,
      state: st.consignee.state, zip: st.consignee.zip, contactName: st.consignee.contactName, phone: st.consignee.phone,
      quantity: st.quantity, notes: st.notes ?? st.consignee.deliveryNotes,
    })),
  };
  const conf = buildConfirmationEmail(emailInput, { carrierName: quote.carrier.name, contactName: quote.carrier.contacts[0]?.name, price: Number(quote.price) });
  const to = quote.carrier.contacts.map((c) => c.email);
  if (to.length === 0) return { ok: false, error: "Carrier has no active contact email" };
  const r = await sendFreightEmail(to, conf.subject, conf.body);
  if (r.sent) await db.freightShipment.update({ where: { id: s.id }, data: { confirmationSentAt: new Date() } });
  revalidatePath(`/freight/${s.id}`);
  return r.sent ? { ok: true } : { ok: false, error: r.error };
}

const TRANSITIONS: Record<string, string[]> = {
  BOOKED: ["PICKED_UP", "CANCELLED"],
  PICKED_UP: ["DELIVERED"],
  QUOTING: ["CANCELLED"],
};

export async function updateShipmentStatus(shipmentId: string, to: "PICKED_UP" | "DELIVERED" | "CANCELLED"): Promise<{ ok: boolean; error?: string }> {
  await requireManager();
  const s = await db.freightShipment.findUnique({ where: { id: shipmentId }, select: { status: true } });
  if (!s) return { ok: false, error: "Not found" };
  if (!TRANSITIONS[s.status]?.includes(to)) return { ok: false, error: `Cannot go ${s.status} -> ${to}` };
  await db.freightShipment.update({ where: { id: shipmentId }, data: { status: to } });
  revalidatePath(`/freight/${shipmentId}`);
  revalidatePath("/freight");
  return { ok: true };
}

/** Manual price entry / correction — human input supersedes AI (spec §5). */
export async function overrideQuote(quoteId: string, data: { price: number; transitDays?: number | null }): Promise<{ ok: boolean; error?: string }> {
  await requireManager();
  if (!Number.isFinite(data.price) || data.price <= 0) return { ok: false, error: "Invalid price" };
  const quote = await db.freightQuote.findUnique({ where: { id: quoteId }, select: { shipmentId: true } });
  if (!quote) return { ok: false, error: "Not found" };
  await db.freightQuote.update({
    where: { id: quoteId },
    data: { status: "QUOTED", price: data.price, transitDays: data.transitDays ?? null, parsedByAi: false },
  });
  revalidatePath(`/freight/${quote.shipmentId}`);
  return { ok: true };
}

/** Manual "check replies now" — same code path as the cron (works on any Vercel plan). */
export async function checkRepliesNow(): Promise<{ processed: number; matched: number }> {
  await requireManager();
  const r = await pollFreightInbox();
  revalidatePath("/freight");
  return r;
}
```

- [ ] **Step 2: Typecheck via build**

```bash
pnpm --filter rhino-brain exec tsc --noEmit -p .
```

Expected: no errors in `src/actions/freight.ts` (pre-existing errors elsewhere, if any, are out of scope).

- [ ] **Step 3: Commit**

```bash
git add apps/rhino-brain/src/actions/freight.ts
git commit -m "feat(freight): server actions — CRUD, blast send, award, status, inbox check"
```

---

### Task 6: Cron route + vercel.json

**Files:**
- Create: `apps/rhino-brain/src/app/api/cron/freight-poll/route.ts`
- Modify: `vercel.json` (repo root)

**Interfaces:**
- Consumes: `pollFreightInbox` from `@rhino/services`.
- Produces: `GET /api/cron/freight-poll` guarded by `Authorization: Bearer ${CRON_SECRET}`.

- [ ] **Step 1: Implement the route**

`apps/rhino-brain/src/app/api/cron/freight-poll/route.ts`:

```ts
import { NextResponse } from "next/server";
import { pollFreightInbox } from "@rhino/services";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // IMAP + per-message AI extraction

/** Vercel Cron entry (vercel.json). Manual equivalent: checkRepliesNow action. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await pollFreightInbox();
  return NextResponse.json(result);
}
```

- [ ] **Step 2: Add cron schedule to root vercel.json**

Replace `vercel.json` content with:

```json
{
  "regions": ["pdx1"],
  "crons": [
    { "path": "/api/cron/freight-poll", "schedule": "*/10 * * * *" }
  ]
}
```

Note: `*/10 * * * *` requires a Vercel Pro plan; on Hobby, crons run at most daily — the UI's "Check replies" button (Task 7) covers the gap either way. Set `CRON_SECRET` in Vercel env.

- [ ] **Step 3: Commit**

```bash
git add apps/rhino-brain/src/app/api/cron/freight-poll/route.ts vercel.json
git commit -m "feat(freight): cron reply-poll route every 10 min"
```

---

### Task 7: UI pages + components + nav

**Files:**
- Create: `apps/rhino-brain/src/app/(app)/freight/page.tsx` (shipment list)
- Create: `apps/rhino-brain/src/app/(app)/freight/new/page.tsx` + `apps/rhino-brain/src/components/freight-new-form.tsx`
- Create: `apps/rhino-brain/src/app/(app)/freight/[id]/page.tsx` + `apps/rhino-brain/src/components/freight-quote-table.tsx`
- Create: `apps/rhino-brain/src/app/(app)/freight/carriers/page.tsx` + `apps/rhino-brain/src/components/freight-carrier-manager.tsx`
- Create: `apps/rhino-brain/src/app/(app)/freight/consignees/page.tsx` + `apps/rhino-brain/src/components/freight-consignee-manager.tsx`
- Modify: `apps/rhino-brain/src/app/(app)/layout.tsx` (nav entry after the Prospecting line)

**Interfaces:**
- Consumes: every action from Task 5 (exact names above); Tailwind slate/emerald/red utility classes as used in `prospecting/page.tsx`.

- [ ] **Step 1: Nav entry**

In `apps/rhino-brain/src/app/(app)/layout.tsx`, after the `/prospecting` line (layout.tsx:22), add:

```ts
    { href: "/freight", label: "Freight 物流", icon: "🚚" },
```

- [ ] **Step 2: Shipment list page**

`apps/rhino-brain/src/app/(app)/freight/page.tsx`:

```tsx
import Link from "next/link";
import { db } from "@/lib/db";
import { requireManager, locationScope } from "@/lib/auth";
import { CheckRepliesButton } from "@/components/freight-quote-table";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  QUOTING: "bg-amber-100 text-amber-800",
  BOOKED: "bg-emerald-100 text-emerald-800",
  PICKED_UP: "bg-blue-100 text-blue-800",
  DELIVERED: "bg-slate-200 text-slate-600",
  CANCELLED: "bg-red-100 text-red-700",
};

export default async function FreightPage() {
  const session = await requireManager();
  const scope = locationScope(session);
  const shipments = await db.freightShipment.findMany({
    where: { ...scope },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      stops: { include: { consignee: true }, orderBy: { sequence: "asc" } },
      quotes: true,
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Freight 物流</h1>
        <div className="flex items-center gap-2">
          <CheckRepliesButton />
          <Link href="/freight/carriers" className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Carriers</Link>
          <Link href="/freight/consignees" className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">收货方</Link>
          <Link href="/freight/new" className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">+ 新询价</Link>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="p-2">单号</th><th className="p-2">线路</th><th className="p-2">提货日</th>
              <th className="p-2">状态</th><th className="p-2">回复</th><th className="p-2">最低价</th>
            </tr>
          </thead>
          <tbody>
            {shipments.map((s) => {
              const replied = s.quotes.filter((q) => q.repliedAt).length;
              const prices = s.quotes.filter((q) => q.price !== null).map((q) => Number(q.price));
              const route = s.stops.map((st) => `${st.consignee.city} ${st.consignee.state}`).join(" + ");
              return (
                <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-2 font-mono"><Link href={`/freight/${s.id}`} className="text-blue-700 hover:underline">{s.refCode}</Link></td>
                  <td className="p-2">{s.originLabel} → {route}</td>
                  <td className="p-2">{s.pickupDate.toISOString().slice(0, 10)}</td>
                  <td className="p-2"><span className={`rounded px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[s.status]}`}>{s.status}</span></td>
                  <td className="p-2">{replied}/{s.quotes.length}</td>
                  <td className="p-2">{prices.length ? `$${Math.min(...prices).toLocaleString()}` : "—"}</td>
                </tr>
              );
            })}
            {shipments.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-slate-400">还没有询价单 — 点右上角"+ 新询价"</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: New-shipment form**

`apps/rhino-brain/src/app/(app)/freight/new/page.tsx`:

```tsx
import { db } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { FreightNewForm } from "@/components/freight-new-form";

export const dynamic = "force-dynamic";

export default async function FreightNewPage() {
  await requireManager();
  const [consignees, carriers] = await Promise.all([
    db.freightConsignee.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.freightCarrier.findMany({ where: { active: true }, orderBy: { name: "asc" }, include: { contacts: { where: { active: true } } } }),
  ]);
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-bold">新询价</h1>
      <FreightNewForm
        consignees={consignees.map((c) => ({ id: c.id, name: c.name, city: c.city, state: c.state }))}
        carriers={carriers.map((c) => ({ id: c.id, name: c.name, contactCount: c.contacts.length }))}
      />
    </div>
  );
}
```

`apps/rhino-brain/src/components/freight-new-form.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createShipmentAndSend, previewQuoteEmail } from "@/actions/freight";

type ConsigneeOpt = { id: string; name: string; city: string; state: string };
type CarrierOpt = { id: string; name: string; contactCount: number };
type StopDraft = { consigneeId: string; quantity: string; notes: string };

const DEFAULT_ORIGIN = "11423 Satellite Blvd, Orlando, FL 32837";

export function FreightNewForm({ consignees, carriers }: { consignees: ConsigneeOpt[]; carriers: CarrierOpt[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [originAddress, setOriginAddress] = useState(DEFAULT_ORIGIN);
  const [equipmentType, setEquipmentType] = useState<"DRY_VAN_53" | "FLATBED_53">("DRY_VAN_53");
  const [pickupDate, setPickupDate] = useState("");
  const [notes, setNotes] = useState("");
  const [stops, setStops] = useState<StopDraft[]>([{ consigneeId: "", quantity: "", notes: "" }]);
  const [carrierIds, setCarrierIds] = useState<string[]>(carriers.map((c) => c.id)); // 默认全发 (owner decision)
  const [preview, setPreview] = useState<{ subject: string; body: string } | null>(null);
  const [error, setError] = useState("");

  const input = () => ({
    originAddress,
    originLabel: "Orlando, FL",
    equipmentType,
    pickupDate,
    commodity: "tires",
    notes: notes || undefined,
    stops: stops.filter((s) => s.consigneeId).map((s) => ({ consigneeId: s.consigneeId, quantity: s.quantity || undefined, notes: s.notes || undefined })),
    carrierIds,
  });

  const moveStop = (i: number, dir: -1 | 1) => {
    const next = [...stops];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setStops(next);
  };

  const doPreview = () =>
    start(async () => {
      setError("");
      const r = await previewQuoteEmail(input());
      if (r.error) setError(r.error);
      else setPreview(r);
    });

  const doSend = () =>
    start(async () => {
      setError("");
      const r = await createShipmentAndSend(input());
      if (!r.ok) setError(r.error ?? "发送失败");
      else router.push(`/freight/${r.shipmentId}`);
    });

  return (
    <div className="space-y-4">
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 text-sm">起运地
          <input value={originAddress} onChange={(e) => setOriginAddress(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2" />
        </label>
        <label className="text-sm">车型
          <select value={equipmentType} onChange={(e) => setEquipmentType(e.target.value as any)} className="mt-1 w-full rounded-lg border border-slate-300 p-2">
            <option value="DRY_VAN_53">53&apos; Dry Van 干厢</option>
            <option value="FLATBED_53">53&apos; Flatbed 平板</option>
          </select>
        </label>
        <label className="text-sm">提货日期
          <input type="date" value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2" />
        </label>
        <label className="col-span-2 text-sm">备注(会写进邮件)
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2" />
        </label>
      </div>

      <div className="rounded-lg border border-slate-200 p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">卸货站点(按卸货顺序)</h2>
          <button type="button" onClick={() => setStops([...stops, { consigneeId: "", quantity: "", notes: "" }])} className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold hover:bg-slate-50">+ 加一站</button>
        </div>
        {stops.map((s, i) => (
          <div key={i} className="mb-2 flex items-center gap-2">
            <span className="w-6 text-center text-xs font-bold text-slate-400">{i + 1}</span>
            <select value={s.consigneeId} onChange={(e) => setStops(stops.map((x, j) => (j === i ? { ...x, consigneeId: e.target.value } : x)))} className="flex-1 rounded-lg border border-slate-300 p-2 text-sm">
              <option value="">选收货方…</option>
              {consignees.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.city}, {c.state})</option>)}
            </select>
            <input placeholder="件数/重量 (如 250 tires)" value={s.quantity} onChange={(e) => setStops(stops.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} className="w-44 rounded-lg border border-slate-300 p-2 text-sm" />
            <button type="button" onClick={() => moveStop(i, -1)} className="px-1 text-slate-400 hover:text-slate-700">↑</button>
            <button type="button" onClick={() => moveStop(i, 1)} className="px-1 text-slate-400 hover:text-slate-700">↓</button>
            <button type="button" onClick={() => setStops(stops.filter((_, j) => j !== i))} className="px-1 text-red-400 hover:text-red-600">✕</button>
          </div>
        ))}
        <p className="text-xs text-slate-400">找不到收货方?先去 <a href="/freight/consignees" className="text-blue-600 hover:underline">收货方管理</a> 添加。</p>
      </div>

      <div className="rounded-lg border border-slate-200 p-3">
        <h2 className="mb-2 text-sm font-semibold">发给哪些 Carrier(默认全选)</h2>
        <div className="flex flex-wrap gap-3">
          {carriers.map((c) => (
            <label key={c.id} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={carrierIds.includes(c.id)} onChange={(e) => setCarrierIds(e.target.checked ? [...carrierIds, c.id] : carrierIds.filter((id) => id !== c.id))} />
              {c.name} <span className="text-xs text-slate-400">({c.contactCount} 联系人)</span>
            </label>
          ))}
          {carriers.length === 0 && <p className="text-sm text-slate-400">还没有 carrier — 先去 <a href="/freight/carriers" className="text-blue-600 hover:underline">Carriers</a> 添加。</p>}
        </div>
      </div>

      {preview && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
          <p className="font-semibold">{preview.subject}</p>
          <pre className="mt-2 whitespace-pre-wrap font-sans text-xs text-slate-700">{preview.body}</pre>
        </div>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={doPreview} disabled={pending} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50">预览邮件</button>
        <button type="button" onClick={doSend} disabled={pending || !pickupDate || carrierIds.length === 0} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
          {pending ? "发送中…" : `群发询价 (${carrierIds.length} 家)`}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Shipment detail / comparison page**

`apps/rhino-brain/src/app/(app)/freight/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { FreightQuoteTable, ShipmentStatusButtons, CheckRepliesButton } from "@/components/freight-quote-table";

export const dynamic = "force-dynamic";

export default async function FreightDetailPage({ params }: { params: { id: string } }) {
  await requireManager();
  const s = await db.freightShipment.findUnique({
    where: { id: params.id },
    include: {
      stops: { include: { consignee: true }, orderBy: { sequence: "asc" } },
      quotes: { include: { carrier: { include: { contacts: { where: { active: true } } } } } },
    },
  });
  if (!s) notFound();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold font-mono">{s.refCode} <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-sm font-sans">{s.status}</span></h1>
        <CheckRepliesButton />
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
        <p><b>{s.originLabel}</b> → {s.stops.map((st) => `${st.sequence}. ${st.consignee.name} (${st.consignee.city}, ${st.consignee.state})${st.quantity ? ` — ${st.quantity}` : ""}`).join("  ·  ")}</p>
        <p className="mt-1 text-slate-500">提货 {s.pickupDate.toISOString().slice(0, 10)} · {s.equipmentType === "DRY_VAN_53" ? "53' Dry Van" : "53' Flatbed"} · {s.commodity}{s.notes ? ` · ${s.notes}` : ""}</p>
        {s.status === "BOOKED" && !s.confirmationSentAt && <p className="mt-1 font-semibold text-red-600">⚠ 确认邮件未发出 — 用下面的"重发确认"</p>}
      </div>

      <FreightQuoteTable
        shipmentId={s.id}
        shipmentStatus={s.status}
        awardedQuoteId={s.awardedQuoteId}
        quotes={s.quotes.map((q) => ({
          id: q.id,
          carrierName: q.carrier.name,
          status: q.status,
          price: q.price === null ? null : Number(q.price),
          transitDays: q.transitDays,
          notes: q.notes,
          rawReplyExcerpt: q.rawReplyExcerpt,
          repliedAt: q.repliedAt?.toISOString() ?? null,
          lastError: q.lastError,
        }))}
      />

      <ShipmentStatusButtons shipmentId={s.id} status={s.status} confirmationSent={Boolean(s.confirmationSentAt)} />
    </div>
  );
}
```

`apps/rhino-brain/src/components/freight-quote-table.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { awardQuote, overrideQuote, resendQuote, resendConfirmation, updateShipmentStatus, checkRepliesNow } from "@/actions/freight";

const Q_BADGE: Record<string, string> = {
  SENT: "bg-slate-100 text-slate-500",
  QUOTED: "bg-emerald-100 text-emerald-800",
  DECLINED: "bg-slate-200 text-slate-500 line-through",
  NEEDS_ATTENTION: "bg-amber-100 text-amber-800",
  SEND_FAILED: "bg-red-100 text-red-700",
};

type QuoteRow = {
  id: string; carrierName: string; status: string; price: number | null; transitDays: number | null;
  notes: string | null; rawReplyExcerpt: string | null; repliedAt: string | null; lastError: string | null;
};

export function CheckRepliesButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => start(async () => { await checkRepliesNow(); router.refresh(); })}
      disabled={pending}
      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
    >
      {pending ? "检查中…" : "📬 检查回复"}
    </button>
  );
}

export function FreightQuoteTable({ shipmentId, shipmentStatus, awardedQuoteId, quotes }: {
  shipmentId: string; shipmentStatus: string; awardedQuoteId: string | null; quotes: QuoteRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [price, setPrice] = useState("");
  const [msg, setMsg] = useState("");

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setMsg("");
      const r = await fn();
      if (!r.ok) setMsg(r.error ?? "操作失败");
      router.refresh();
    });

  const best = Math.min(...quotes.filter((q) => q.price !== null).map((q) => q.price!));

  return (
    <div className="space-y-2">
      {msg && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{msg}</div>}
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr><th className="p-2">Carrier</th><th className="p-2">状态</th><th className="p-2">价格</th><th className="p-2">时效</th><th className="p-2">回复时间</th><th className="p-2">备注</th><th className="p-2" /></tr>
          </thead>
          <tbody>
            {quotes.map((q) => (
              <FragmentRow key={q.id} q={q} isBest={q.price !== null && q.price === best} isAwarded={q.id === awardedQuoteId}
                canAward={shipmentStatus === "QUOTING" && q.status === "QUOTED"}
                expanded={expanded === q.id} onToggle={() => setExpanded(expanded === q.id ? null : q.id)}
                editing={editing === q.id} price={price} setPrice={setPrice}
                onEdit={() => { setEditing(q.id); setPrice(q.price?.toString() ?? ""); }}
                onSaveEdit={() => { const p = parseFloat(price); if (p > 0) act(() => overrideQuote(q.id, { price: p })); setEditing(null); }}
                onAward={(sendRegrets) => act(() => awardQuote(q.id, { sendRegrets }))}
                onResend={() => act(() => resendQuote(q.id))}
                pending={pending}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FragmentRow({ q, isBest, isAwarded, canAward, expanded, onToggle, editing, price, setPrice, onEdit, onSaveEdit, onAward, onResend, pending }: {
  q: QuoteRow; isBest: boolean; isAwarded: boolean; canAward: boolean; expanded: boolean; onToggle: () => void;
  editing: boolean; price: string; setPrice: (v: string) => void; onEdit: () => void; onSaveEdit: () => void;
  onAward: (sendRegrets: boolean) => void; onResend: () => void; pending: boolean;
}) {
  return (
    <>
      <tr className={`border-t border-slate-100 ${isAwarded ? "bg-emerald-50" : q.status === "NEEDS_ATTENTION" ? "bg-amber-50" : ""}`}>
        <td className="p-2 font-semibold">{q.carrierName}{isAwarded && " ✅"}</td>
        <td className="p-2"><span className={`rounded px-2 py-0.5 text-xs font-semibold ${Q_BADGE[q.status]}`}>{q.status}</span></td>
        <td className="p-2">
          {editing ? (
            <span className="flex items-center gap-1">
              $<input value={price} onChange={(e) => setPrice(e.target.value)} className="w-24 rounded border border-slate-300 p-1" />
              <button onClick={onSaveEdit} className="text-xs font-semibold text-emerald-700">存</button>
            </span>
          ) : (
            <span className={isBest ? "font-bold text-emerald-700" : ""}>
              {q.price !== null ? `$${q.price.toLocaleString()}` : "—"}
              <button onClick={onEdit} className="ml-1 text-xs text-slate-400 hover:text-slate-700">✎</button>
            </span>
          )}
        </td>
        <td className="p-2">{q.transitDays !== null ? `${q.transitDays} 天` : "—"}</td>
        <td className="p-2 text-xs text-slate-500">{q.repliedAt ? q.repliedAt.slice(0, 16).replace("T", " ") : "—"}</td>
        <td className="p-2 max-w-56 truncate text-xs text-slate-500">{q.lastError ?? q.notes ?? ""}</td>
        <td className="p-2 text-right">
          {q.rawReplyExcerpt && <button onClick={onToggle} className="mr-2 text-xs text-blue-600 hover:underline">{expanded ? "收起" : "原文"}</button>}
          {q.status === "SEND_FAILED" && <button onClick={onResend} disabled={pending} className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold hover:bg-slate-50">重发</button>}
          {canAward && (
            <button
              onClick={() => onAward(confirm("给没中标的已报价 carrier 发一封'已安排'通知吗?\n确定=发,取消=不发") )}
              disabled={pending}
              className="rounded bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
            >选这家</button>
          )}
        </td>
      </tr>
      {expanded && q.rawReplyExcerpt && (
        <tr className="border-t border-slate-100 bg-slate-50">
          <td colSpan={7} className="p-3"><pre className="whitespace-pre-wrap font-sans text-xs text-slate-600">{q.rawReplyExcerpt}</pre></td>
        </tr>
      )}
    </>
  );
}

export function ShipmentStatusButtons({ shipmentId, status, confirmationSent }: { shipmentId: string; status: string; confirmationSent: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const go = (to: "PICKED_UP" | "DELIVERED" | "CANCELLED") =>
    start(async () => { await updateShipmentStatus(shipmentId, to); router.refresh(); });
  const resend = () => start(async () => { await resendConfirmation(shipmentId); router.refresh(); });

  return (
    <div className="flex gap-2">
      {status === "BOOKED" && !confirmationSent && <button onClick={resend} disabled={pending} className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-400">重发确认邮件</button>}
      {status === "BOOKED" && <button onClick={() => go("PICKED_UP")} disabled={pending} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50">已提货</button>}
      {status === "PICKED_UP" && <button onClick={() => go("DELIVERED")} disabled={pending} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50">已送达</button>}
      {(status === "QUOTING" || status === "BOOKED") && <button onClick={() => { if (confirm("确定取消这一单?")) go("CANCELLED"); }} disabled={pending} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50">取消</button>}
    </div>
  );
}
```

- [ ] **Step 5: Carrier manager page**

`apps/rhino-brain/src/app/(app)/freight/carriers/page.tsx`:

```tsx
import { db } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { FreightCarrierManager } from "@/components/freight-carrier-manager";

export const dynamic = "force-dynamic";

export default async function FreightCarriersPage() {
  await requireManager();
  const carriers = await db.freightCarrier.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: { contacts: true },
  });
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-bold">Carriers</h1>
      <FreightCarrierManager
        carriers={carriers.map((c) => ({
          id: c.id, name: c.name, phone: c.phone, mcNumber: c.mcNumber, notes: c.notes, active: c.active,
          equipmentTypes: c.equipmentTypes as ("DRY_VAN_53" | "FLATBED_53")[],
          contacts: c.contacts.map((ct) => ({ id: ct.id, name: ct.name, email: ct.email, active: ct.active })),
        }))}
      />
    </div>
  );
}
```

`apps/rhino-brain/src/components/freight-carrier-manager.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveCarrier, deleteCarrier } from "@/actions/freight";

type Contact = { id?: string; name: string | null; email: string; active: boolean };
type Carrier = { id?: string; name: string; phone: string | null; mcNumber: string | null; notes: string | null; active: boolean; equipmentTypes: ("DRY_VAN_53" | "FLATBED_53")[]; contacts: Contact[] };

const EMPTY: Carrier = { name: "", phone: null, mcNumber: null, notes: null, active: true, equipmentTypes: ["DRY_VAN_53", "FLATBED_53"], contacts: [{ name: "", email: "", active: true }] };

export function FreightCarrierManager({ carriers }: { carriers: Carrier[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<Carrier | null>(null);
  const [error, setError] = useState("");

  const save = () =>
    start(async () => {
      if (!draft) return;
      setError("");
      const r = await saveCarrier({
        ...draft,
        phone: draft.phone || undefined,
        mcNumber: draft.mcNumber || undefined,
        notes: draft.notes || undefined,
        contacts: draft.contacts.filter((c) => c.email).map((c) => ({ ...c, name: c.name || undefined })),
      });
      if (!r.ok) { setError(r.error ?? "保存失败"); return; }
      setDraft(null);
      router.refresh();
    });

  return (
    <div className="space-y-3">
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {!draft && <button onClick={() => setDraft(EMPTY)} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">+ 新 Carrier</button>}

      {draft && (
        <div className="space-y-2 rounded-lg border border-slate-300 p-3">
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="名称 *" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="rounded-lg border border-slate-300 p-2 text-sm" />
            <input placeholder="电话" value={draft.phone ?? ""} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} className="rounded-lg border border-slate-300 p-2 text-sm" />
            <input placeholder="MC 号" value={draft.mcNumber ?? ""} onChange={(e) => setDraft({ ...draft, mcNumber: e.target.value })} className="rounded-lg border border-slate-300 p-2 text-sm" />
            <input placeholder="备注" value={draft.notes ?? ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} className="rounded-lg border border-slate-300 p-2 text-sm" />
          </div>
          <div className="flex gap-4 text-sm">
            {(["DRY_VAN_53", "FLATBED_53"] as const).map((t) => (
              <label key={t} className="flex items-center gap-1.5">
                <input type="checkbox" checked={draft.equipmentTypes.includes(t)}
                  onChange={(e) => setDraft({ ...draft, equipmentTypes: e.target.checked ? [...draft.equipmentTypes, t] : draft.equipmentTypes.filter((x) => x !== t) })} />
                {t === "DRY_VAN_53" ? "53' 干厢" : "53' 平板"}
              </label>
            ))}
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-slate-500">联系人(可多个,询价同时发给所有人)</p>
            {draft.contacts.map((c, i) => (
              <div key={i} className="flex gap-2">
                <input placeholder="姓名" value={c.name ?? ""} onChange={(e) => setDraft({ ...draft, contacts: draft.contacts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} className="w-36 rounded-lg border border-slate-300 p-2 text-sm" />
                <input placeholder="邮箱 *" value={c.email} onChange={(e) => setDraft({ ...draft, contacts: draft.contacts.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)) })} className="flex-1 rounded-lg border border-slate-300 p-2 text-sm" />
                <button onClick={() => setDraft({ ...draft, contacts: draft.contacts.filter((_, j) => j !== i) })} className="px-1 text-red-400 hover:text-red-600">✕</button>
              </div>
            ))}
            <button onClick={() => setDraft({ ...draft, contacts: [...draft.contacts, { name: "", email: "", active: true }] })} className="text-xs font-semibold text-blue-600 hover:underline">+ 加联系人</button>
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={pending || !draft.name} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50">保存</button>
            <button onClick={() => setDraft(null)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50">取消</button>
          </div>
        </div>
      )}

      <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {carriers.map((c) => (
          <div key={c.id} className={`flex items-center justify-between p-3 ${c.active ? "" : "opacity-50"}`}>
            <div>
              <p className="text-sm font-semibold">{c.name} {!c.active && <span className="text-xs">(停用)</span>}</p>
              <p className="text-xs text-slate-500">{c.contacts.map((ct) => ct.email).join(" · ")}{c.mcNumber ? ` · MC ${c.mcNumber}` : ""}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDraft(c)} className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold hover:bg-slate-50">编辑</button>
              <button onClick={() => { if (confirm(`删除/停用 ${c.name}?`)) start(async () => { await deleteCarrier(c.id!); router.refresh(); }); }} className="rounded border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">删除</button>
            </div>
          </div>
        ))}
        {carriers.length === 0 && <p className="p-4 text-sm text-slate-400">还没有 carrier。</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Consignee manager page**

`apps/rhino-brain/src/app/(app)/freight/consignees/page.tsx`:

```tsx
import { db } from "@/lib/db";
import { requireManager } from "@/lib/auth";
import { FreightConsigneeManager } from "@/components/freight-consignee-manager";

export const dynamic = "force-dynamic";

export default async function FreightConsigneesPage() {
  await requireManager();
  const consignees = await db.freightConsignee.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] });
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-xl font-bold">收货方</h1>
      <FreightConsigneeManager
        consignees={consignees.map((c) => ({
          id: c.id, name: c.name, addressLine: c.addressLine, city: c.city, state: c.state, zip: c.zip,
          contactName: c.contactName, phone: c.phone, deliveryNotes: c.deliveryNotes, active: c.active,
        }))}
      />
    </div>
  );
}
```

`apps/rhino-brain/src/components/freight-consignee-manager.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveConsignee, deleteConsignee } from "@/actions/freight";

type Consignee = { id?: string; name: string; addressLine: string; city: string; state: string; zip: string; contactName: string | null; phone: string | null; deliveryNotes: string | null; active: boolean };

const EMPTY: Consignee = { name: "", addressLine: "", city: "", state: "", zip: "", contactName: null, phone: null, deliveryNotes: null, active: true };

export function FreightConsigneeManager({ consignees }: { consignees: Consignee[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<Consignee | null>(null);
  const [error, setError] = useState("");

  const save = () =>
    start(async () => {
      if (!draft) return;
      setError("");
      const r = await saveConsignee({
        ...draft,
        contactName: draft.contactName || undefined,
        phone: draft.phone || undefined,
        deliveryNotes: draft.deliveryNotes || undefined,
      });
      if (!r.ok) { setError(r.error ?? "保存失败"); return; }
      setDraft(null);
      router.refresh();
    });

  const set = (patch: Partial<Consignee>) => setDraft(draft ? { ...draft, ...patch } : draft);

  return (
    <div className="space-y-3">
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {!draft && <button onClick={() => setDraft(EMPTY)} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">+ 新收货方</button>}

      {draft && (
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-300 p-3">
          <input placeholder="名称 * (如 Pearson GA – ABC Tire)" value={draft.name} onChange={(e) => set({ name: e.target.value })} className="col-span-2 rounded-lg border border-slate-300 p-2 text-sm" />
          <input placeholder="街道地址 *" value={draft.addressLine} onChange={(e) => set({ addressLine: e.target.value })} className="col-span-2 rounded-lg border border-slate-300 p-2 text-sm" />
          <input placeholder="城市 *" value={draft.city} onChange={(e) => set({ city: e.target.value })} className="rounded-lg border border-slate-300 p-2 text-sm" />
          <div className="flex gap-2">
            <input placeholder="州 * (GA)" maxLength={2} value={draft.state} onChange={(e) => set({ state: e.target.value.toUpperCase() })} className="w-20 rounded-lg border border-slate-300 p-2 text-sm" />
            <input placeholder="ZIP *" value={draft.zip} onChange={(e) => set({ zip: e.target.value })} className="flex-1 rounded-lg border border-slate-300 p-2 text-sm" />
          </div>
          <input placeholder="联系人" value={draft.contactName ?? ""} onChange={(e) => set({ contactName: e.target.value })} className="rounded-lg border border-slate-300 p-2 text-sm" />
          <input placeholder="电话" value={draft.phone ?? ""} onChange={(e) => set({ phone: e.target.value })} className="rounded-lg border border-slate-300 p-2 text-sm" />
          <input placeholder="送货备注" value={draft.deliveryNotes ?? ""} onChange={(e) => set({ deliveryNotes: e.target.value })} className="col-span-2 rounded-lg border border-slate-300 p-2 text-sm" />
          <div className="col-span-2 flex gap-2">
            <button onClick={save} disabled={pending || !draft.name || !draft.addressLine || !draft.city || draft.state.length !== 2 || draft.zip.length < 5} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50">保存</button>
            <button onClick={() => setDraft(null)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50">取消</button>
          </div>
        </div>
      )}

      <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {consignees.map((c) => (
          <div key={c.id} className={`flex items-center justify-between p-3 ${c.active ? "" : "opacity-50"}`}>
            <div>
              <p className="text-sm font-semibold">{c.name} {!c.active && <span className="text-xs">(停用)</span>}</p>
              <p className="text-xs text-slate-500">{c.addressLine}, {c.city}, {c.state} {c.zip}{c.contactName ? ` · ${c.contactName}` : ""}{c.phone ? ` ${c.phone}` : ""}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDraft(c)} className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold hover:bg-slate-50">编辑</button>
              <button onClick={() => { if (confirm(`删除/停用 ${c.name}?`)) start(async () => { await deleteConsignee(c.id!); router.refresh(); }); }} className="rounded border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">删除</button>
            </div>
          </div>
        ))}
        {consignees.length === 0 && <p className="p-4 text-sm text-slate-400">还没有收货方。</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Manual end-to-end verification (dev server)**

Start the dev server (preview tools, launch.json). Then verify, without mail env set (send is a safe no-op that records SEND_FAILED):

1. `/freight/consignees` → add "Pearson GA – Test Tire", 100 Main St, Pearson, GA 31642.
2. `/freight/carriers` → TMS visible from Task 1 seed; edit works.
3. `/freight/new` → default carriers all checked; add 2 stops; reorder with ↑↓; 预览邮件 shows subject `Rate Request RT-XXXX-XXX ... (2 stops)` and both stops in order; send → redirects to detail.
4. Detail page: quotes show SEND_FAILED (no mail env) with lastError; 重发 button visible.
5. Manually set a quote to QUOTED with a price via ✎ override → 选这家 → status BOOKED (confirmation email skipped/no-op, red "确认邮件未发出" banner + 重发确认 visible).
6. 已提货 → 已送达 transitions work; list page shows progress and lowest price.

- [ ] **Step 8: Commit**

```bash
git add apps/rhino-brain/src
git commit -m "feat(freight): UI — shipment list, multi-stop new form, quote comparison, carrier/consignee managers"
```

---

## Post-plan checklist (owner setup, before go-live)

1. Gmail `luckywarehouse888@gmail.com`: enable 2-Step Verification → create an **App Password** → set `FREIGHT_GMAIL_USER` / `FREIGHT_GMAIL_APP_PASS` in Vercel env (and local `.env`).
2. Set `CRON_SECRET` in Vercel env.
3. Confirm origin address `11423 Satellite Blvd, Orlando, FL 32837` is the real shipping warehouse.
4. Run `packages/database/scripts/seed-freight-carrier.ts` against prod DB (TMS).
5. Send one real test blast to a carrier and verify the reply lands in the comparison table.
