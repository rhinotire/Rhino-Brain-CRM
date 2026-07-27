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
- **Dedicated mailbox:** `luckywarehouse888@gmail.com` (confirmed 2026-07-25).
  *Implementation amendment (plan 2026-07-25):* transport is Gmail **SMTP send +
  IMAP polling with an app password in env vars** (`FREIGHT_GMAIL_USER`,
  `FREIGHT_GMAIL_APP_PASS`) — same env-based pattern as the existing Zoho
  `email.ts` — instead of the Gmail-API-OAuth `Mailbox` table. Far less setup
  for the owner (no Google Cloud console); prospecting can reuse the identical
  pattern with its own env pair.
- **Multi-stop pooled loads:** one truck may deliver to several customers
  (multiple drops). A shipment has 1..N ordered stops; drop order is specified
  by the user at creation and carriers quote an all-in rate for the full route
  including all drop fees.
- **Architecture: Approach A** — full Gmail integration (Mailbox table + OAuth +
  Vercel Cron polling), built as shared infrastructure that the prospecting agent
  (docs/superpowers/specs/2026-07-24-ai-prospecting-agent-design.md) will reuse.

## 3. Data model (Prisma, packages/database)

New models:

- **`Mailbox`** (shared infra): `email`, `provider` (GMAIL), encrypted OAuth
  credentials, `purpose` (FREIGHT | PROSPECTING), `active`. Only the freight row is
  created now; schema matches the prospecting spec so it can be reused.
- **`FreightCarrier`**: `name`, `phone?`, `mcNumber?`, `equipmentTypes`
  (DRY_VAN_53, FLATBED_53), `notes?`, `active`. Fully user-maintained via
  `/freight/carriers` CRUD (William adds/edits carriers himself).
- **`FreightCarrierContact`** (a carrier can have several email contacts):
  `carrierId`, `name?`, `email`, `active`. Quote emails go out as ONE email
  per carrier with all active contacts in To — replies from any contact land
  in the same Gmail thread. Seed carrier: TMS with dayleen.marine@ and
  tim.sebacher@tms-transportation.com.
- **`FreightConsignee`** (saved destinations, entered once): `name`
  (e.g. "Pearson GA – XXX Tire"), `addressLine`, `city`, `state`, `zip`,
  `contactName?`, `phone?`, `deliveryNotes?`, `active`.
- **`FreightShipment`**: `refCode` (e.g. RT-2607-001), `originAddress`
  (defaults to Rhino FL warehouse — 11423 Satellite Blvd, Orlando, FL 32837
  per CRM data, confirm at go-live; editable per shipment), `equipmentType`
  (DRY_VAN_53 | FLATBED_53), `pickupDate`, `commodity` (default "tires"),
  `notes`, `status`, `awardedQuoteId?`, `locationId`
  (company isolation — same scoping rule as the rest of the CRM), `createdById`.
- **`FreightShipmentStop`** (multi-stop pooled loads): `shipmentId`,
  `sequence` (1..N, user-ordered), `consigneeId`, `quantity`/`weight` for that
  stop (each pooled customer's own goods), `notes?`. A single-drop load is
  simply N=1 — same logic throughout.
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
- One email per carrier (no cross-carrier CC — carriers must not see each
  other; a carrier's own multiple contacts share one To line), in English:
  full route with all stops listed in drop order (address + per-stop
  tire count/weight), equipment type, pickup date, request for an all-in
  rate covering all drop fees, and earliest pickup.
- Subject carries the refCode and stop count:
  `Rate Request RT-2607-001: Orlando FL → Pearson GA + Douglas GA (2 stops), 53' Dry Van`.
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
- **`/freight/new`** — new quote request: "Add stop" builds the drop list —
  each stop picks a consignee (inline add) and its tire count/weight, with
  up/down reordering; origin (defaulted), equipment, pickup date, notes →
  carrier checklist (all active pre-checked) → email preview → send.
  Repeat lanes become: pick consignee(s) → change date → send (~30 seconds).
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

## 8. Go-live inputs (provided 2026-07-25)

1. Mailbox: `luckywarehouse888@gmail.com` — still needs a one-time Google OAuth
   authorization by William when the integration is built.
2. Origin warehouse: Rhino FL — default `11423 Satellite Blvd, Orlando, FL 32837`
   (from CRM data; William to confirm; editable per shipment).
3. First carrier: TMS (dayleen.marine@tms-transportation.com,
   tim.sebacher@tms-transportation.com). More carriers added by William via
   the `/freight/carriers` page.
