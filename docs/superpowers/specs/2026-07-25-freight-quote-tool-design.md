# Freight Quote Tool (运费询价工具) — Design

**Date:** 2026-07-25
**Status:** Approved by William (design sections reviewed 2026-07-25)
**Module:** `/freight` in RHINO BRAIN (apps/rhino-brain) + services in packages/services

## 1. Problem

Rhino Tire USA regularly ships 53' dry vans and 53' flatbeds to recurring destinations
(Pearson GA, Douglas GA, Nashville GA, New York, Texas). Every load requires manually
emailing multiple carriers for quotes, tracking replies, comparing prices, and confirming
the winner — repetitive and time-consuming.

## 2. Goal

One-time data entry, then per-load workflow is: pick saved consignee → adjust date →
one-click blast quote-request emails to all carriers → AI reads replies and fills a
comparison table → user clicks the winner → system auto-sends booking confirmation.

Decisions confirmed with William:
- **Full automation + AI reads replies** (not manual quote entry).
- **Carrier list defaults to all active carriers**, uncheckable per shipment.
- **Award flow:** auto-send confirmation email to the winner, status → BOOKED;
  pickup/delivery status updated manually afterwards.
- **Dedicated mailbox** (not rhinotyre@gmail.com) — address TBD from William;
  mailbox is configurable, stored in the shared `Mailbox` table.
- **Architecture: Approach A** — full Gmail integration (Mailbox table + OAuth +
  Vercel Cron polling), built as shared infrastructure that the prospecting agent
  (docs/superpowers/specs/2026-07-24-ai-prospecting-agent-design.md) will reuse.

## 3. Data model (Prisma, packages/database)

New models:

- **`Mailbox`** (shared infra): `email`, `provider` (GMAIL), encrypted OAuth
  credentials, `purpose` (FREIGHT | PROSPECTING), `active`. Only the freight row is
  created now; schema matches the prospecting spec so it can be reused.
- **`FreightCarrier`**: `name`, `contactName?`, `email`, `phone?`, `mcNumber?`,
  `equipmentTypes` (DRY_VAN_53, FLATBED_53), `notes?`, `active`.
- **`FreightConsignee`** (saved destinations, entered once): `name`
  (e.g. "Pearson GA – XXX Tire"), `addressLine`, `city`, `state`, `zip`,
  `contactName?`, `phone?`, `deliveryNotes?`, `active`.
- **`FreightShipment`**: `refCode` (e.g. RT-2607-001), `consigneeId`,
  `originAddress` (defaults to Rhino warehouse, editable), `equipmentType`
  (DRY_VAN_53 | FLATBED_53), `pickupDate`, `commodity` (default "tires"),
  `quantity`/`weight`, `notes`, `status`, `awardedQuoteId?`, `locationId`
  (company isolation — same scoping rule as the rest of the CRM), `createdById`.
- **`FreightQuote`** (one row per carrier per shipment, unique
  `[shipmentId, carrierId]`): `status`, `price?`, `currency` (USD),
  `transitDays?`, `gmailThreadId`, `gmailMessageId?`, `rawReplyExcerpt?`,
  `parsedByAi`, `parseConfidence?`, `repliedAt?`.

Status flows:

```
Shipment: QUOTING → BOOKED → PICKED_UP → DELIVERED   (CANCELLED from any state)
Quote:    SENT → QUOTED | DECLINED | NEEDS_ATTENTION | SEND_FAILED
```

## 4. Email flow

**Send (one-click blast):**
- One email per carrier (no CC — carriers must not see each other), in English:
  lane (origin → destination), equipment type, pickup date, commodity
  (tires + weight/count), request for all-in rate and earliest pickup.
- Subject carries the refCode:
  `Rate Request RT-2607-001: Ocala FL → Pearson GA, 53' Dry Van`.
  Reply matching uses Gmail `threadId` primary + refCode-in-subject fallback.
- Preview screen before sending; email body editable per send.
- Per-carrier failure isolation: one failed send marks that quote SEND_FAILED
  (individually retryable) and never aborts the batch — same lesson as
  prospecting's per-candidate guard (commit d355516).

**Reply polling + AI parsing (Vercel Cron, every 10 minutes):**
- Poll the freight mailbox for new replies in threads of QUOTING shipments.
- Claude (existing `@anthropic-ai/sdk`) extracts strict JSON:
  `{verdict: QUOTED|DECLINED|QUESTION|OTHER, price?, transitDays?, notes?}`.
- Field-level validation (price must be a plausible number, etc.). Parse failure
  or low confidence → NEEDS_ATTENTION with raw text shown in UI; the system
  never guesses a price. (Mirrors prospecting fixes e70667e / eb3c6d1.)
- Carrier counter-questions → NEEDS_ATTENTION; William replies in Gmail;
  the cron keeps reading subsequent replies in the thread.

**Award:**
- "选这家" in the comparison table → confirm dialog → confirmation email sent in
  the same thread (price, pickup date, addresses, contacts) → shipment BOOKED.
- Non-winners get no email by default (industry norm); an optional checkbox at
  award time sends them a brief "load covered" note.

## 5. UI (new "物流 Freight" sidebar entry)

- **`/freight`** — shipment list: refCode, lane, pickup date, status chip,
  reply progress (e.g. `5/8 已回复`), current lowest price.
- **`/freight/new`** — new quote request: consignee dropdown (inline add),
  origin (defaulted), equipment, pickup date, weight/count, notes → carrier
  checklist (all active pre-checked) → email preview → send.
  Repeat lanes become: pick consignee → change date → send (~30 seconds).
- **`/freight/[id]`** — comparison table: per-carrier price, transit, replied-at,
  expandable raw reply, NEEDS_ATTENTION highlighted; award button per row;
  status timeline; manual PICKED_UP / DELIVERED buttons after booking.
  Manual price override is allowed and supersedes the AI-parsed value.
- **`/freight/carriers`**, **`/freight/consignees`** — CRUD for the address books.

## 6. Error handling

- Gmail OAuth expiry → red banner in the freight pages prompting re-auth.
- Cron parses each reply independently; one bad email cannot stall the rest.
- Every AI verdict keeps the raw excerpt for human verification/override.

## 7. Testing

Core services live in `packages/services` with unit tests following the existing
`*.test.ts` pattern: quote-reply JSON validation, thread/refCode matching,
award transition logic, carrier-selection defaults.

## 8. Open items (needed before go-live, not blocking development)

1. Dedicated mailbox address + one-time Google OAuth authorization by William.
2. Full origin warehouse address (Rhino FL).
3. Carrier list (names + emails).
