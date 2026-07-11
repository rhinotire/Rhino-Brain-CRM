# AI Agent Rules — RHINO TIRES USA Platform

Core law (CLAUDE.md §12): AI answers ONLY from controlled tools over verified data. When data is unavailable, AI says confirmation is required and offers a quote request or human follow-up. No exceptions.

## Approved tool whitelist (packages/services/ai-tools)

| Tool | Returns | Notes |
|---|---|---|
| searchProducts(query, filters) | PUBLIC products only | size-tolerant parsing ("235 80 16") |
| getProductDetail(slug) | specs, images, relations | never cost/priceA–D to anonymous |
| checkInventoryStatus(sku, region?) | status bucket per warehouse | In Stock / Limited / Contact — never exact counts publicly |
| getCompatibleItems(sku, type) | wheels/valves/alternatives | from ProductRelation only |
| getCustomerPrice(sku) | dealer tier price | DEALER SESSION ONLY, server-verified |
| createQuoteRequest(payload) | quote + lead + rep assignment | rate-limited, validated |
| createLead(payload) | CRM lead | source = AI_ASSISTANT |
| getApprovedKnowledge(topic) | versioned approved docs | warranty, dealer program, shipping, load tables |

## Prohibited (hard fail, not soft warning)

Inventing or estimating: inventory, pricing, delivery dates, freight, load capacity, pressure, fitment, warranty terms, credit approval, order status, compatibility. If a tool returns nothing → "I need to confirm that with our team" + quote/contact CTA. Never free-text answers about specs; specs come from TireSpec/WheelSpec rows only.

## Feature rollout

**Phase 1 — AI Tire Finder (public).** NL query → searchProducts + getCompatibleItems + checkInventoryStatus → verified matches with specs, stock badge, one-tap Get Quote. Streams, mobile-first, logs AiUsage.

**Phase 2 — AI Quote Agent (public + dealer).** "120 pcs ST225/75R15 10PR to Tampa" → inventory check; anonymous: createQuoteRequest + createLead + rep assignment; dealer session: real tier price via getCustomerPrice, draft Quote. Freight: only quote if a rate table exists, else "freight confirmed by your rep".
**Phase 2 — Knowledge Assistant (public).** getApprovedKnowledge only; cites source doc + date; refuses topics outside approved sources.

**Phase 3 — Dealer Qualification (internal).** Scores WEBSITE_DEALER_APP leads (business type, volume, location, credit status) → priority queue + rep routing. Score is advice; humans approve accounts.
**Phase 3 — Sales Copilot (RHINO BRAIN, per UPGRADE-PLAN Phase 7).** Deterministic pre-ranking → Claude explains; message generator; ask box. Reuse existing plan; scoped by repScope/locationScope.

## Engineering rules

- Anthropic Messages API server-side only (`ANTHROPIC_API_KEY` never client-side). Model per env config.
- Deterministic fallback: every AI feature must degrade to a working non-AI path (plain search, plain form) if the API is down or key unset.
- Log every call to AiUsage (feature, tokens, userId?). Rate limit public endpoints per IP + session.
- Prompt injection: user text never becomes tool parameters without validation; tools enforce visibility/authorization independently of the model.
- Every AI response ends with a conversion action: Get Quote / Talk to a Specialist / Apply as Dealer.

## Wheel Visualizer track

- Phase 2: embed third-party visualizer (iConfigurators or AutoSync) on automotive wheel pages ONLY — lazy-loaded on that route, SKU-mapped so only wheels we actually stock appear, quote CTA under the widget.
- Phase 3: self-built Trailer Wheel Finder (boltPattern + diameter + load → WheelSpec query + compatible ST tires + valves + stock). Shares the same tool layer as AI Tire Finder.
