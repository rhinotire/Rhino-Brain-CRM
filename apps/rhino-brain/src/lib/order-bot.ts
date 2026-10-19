import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { fmtMoney } from "./domain";

/**
 * SMS assistant for the owner (开车的时候用, 2026-10-19). One text in, one
 * answer out — four intents:
 *   order  → parse + match, draft queued for SMS confirmation, the PC robot
 *            keys a TireGuru work order on "1"
 *   price  → product price + stock per warehouse
 *   stock  → same lookup, stock-first wording
 *   ar     → a customer's open balance / aging
 * Matching runs against the CRM, which mirrors TireGuru via the 2h sync.
 */

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

export type ParsedItem = { sku: string | null; description: string; qty: number; price: number | null; matched: boolean };
export type ParsedOrder = {
  ok: boolean;
  error?: string;
  customerId: string | null;
  customerName: string;
  locationId: string | null;
  items: ParsedItem[];
  notes: string | null;
  total: number | null;
};
export type OwnerSmsResult =
  | { kind: "order"; order: ParsedOrder }
  | { kind: "reply"; text: string };

const norm = (s: string) => s.toLowerCase().replace(/\s*&\s*/g, "&").replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------------------
// intent parsing (one Claude call)
// ---------------------------------------------------------------------------
type Intent = {
  intent: "order" | "price" | "stock" | "ar" | "unknown";
  customer?: string | null;
  items?: { query: string; qty: number }[];
  notes?: string | null;
};

async function classify(rawText: string): Promise<Intent> {
  const anthropic = new Anthropic();
  const resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 700,
    system: `You parse a tire-wholesale owner's dictated SMS (English or Chinese) into JSON.
Intents:
- "order": he wants to PLACE an order for a customer ("order/下单/给X来4条").
- "price": he asks a price / best price / 什么价 / 多少钱 for product(s).
- "stock": he asks availability / 有没有货 / 还有几条.
- "ar": he asks what a customer owes / balance / 欠款 / 账龄.
- "unknown": anything else.
Reply ONLY JSON: {"intent": "...", "customer": string|null (business name if mentioned), "items": [{"query": string (product words: size/brand/sku, verbatim), "qty": number}] , "notes": string|null}.
Quantities: "4条"/"4 pcs"/"x4" → 4; if none said use 1. Never invent items. For "ar" items is [].`,
    messages: [{ role: "user", content: rawText }],
  });
  const text = resp.content.filter(b => b.type === "text").map(b => (b.type === "text" ? b.text : "")).join("");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return { intent: "unknown" };
  try { return JSON.parse(m[0]) as Intent; } catch { return { intent: "unknown" }; }
}

// ---------------------------------------------------------------------------
// matching helpers
// ---------------------------------------------------------------------------
async function matchCustomer(custQuery: string) {
  const candidates = await db.customer.findMany({
    where: { status: { notIn: ["DO_NOT_CONTACT"] } },
    select: { id: true, companyName: true, locationId: true, arWriteOffAt: true },
  });
  const nq = norm(custQuery);
  let customer = candidates.find(c => norm(c.companyName) === nq)
    ?? candidates.find(c => norm(c.companyName).includes(nq) || nq.includes(norm(c.companyName)));
  if (!customer) {
    // word-overlap fallback: the FIRST word is usually the distinctive name —
    // require it, or "BUDS AUTO" lands on any "...AUTO..." (bug 2026-10-19)
    const words = nq.split(" ").filter(w => w.length > 2);
    const first = words[0];
    const scored = candidates
      .map(c => ({ c, score: words.filter(w => norm(c.companyName).includes(w)).length }))
      .filter(x => x.score >= Math.max(1, Math.ceil(words.length / 2)) && (!first || norm(x.c.companyName).includes(first)))
      .sort((a, b) => b.score - a.score);
    customer = scored[0]?.c;
  }
  return customer ?? null;
}

type MatchedProduct = { id: string; sku: string; description: string; priceA: number | null; sizeSpec: string | null };

async function matchProduct(q: string): Promise<MatchedProduct | null> {
  const bySku = await db.product.findFirst({
    where: { sku: { equals: q.trim(), mode: "insensitive" } },
    select: { id: true, sku: true, description: true, priceA: true, sizeSpec: true },
  });
  if (bySku) return { ...bySku, priceA: bySku.priceA ? Number(bySku.priceA) : null };

  // Sizes arrive in any dictated shape — 205/55R16, 205-55-16, 205 55 16,
  // ST235/80R16 — so match on DIGITS ONLY against sizeSpec/sku/description.
  const rawSize = (q.match(/(?:[a-zA-Z]{0,2})?\d{2,3}[\s\/xX.·-]{0,2}\d{2,3}[\s\/xXrRdD.·-]{0,2}\d{2}(?:\.\d)?|\d{2}[xX]\d{1,2}(?:\.\d+)?/) || [])[0];
  const sizeDigits = rawSize ? rawSize.replace(/\D/g, "") : null;
  const words = q.replace(rawSize ?? "\u0000", " ").split(/\s+/).filter(w => w.length > 1).slice(0, 3);
  const found = await db.product.findMany({
    where: words.length
      ? { AND: words.map(w => ({ OR: [{ description: { contains: w, mode: "insensitive" as const } }, { brand: { contains: w, mode: "insensitive" as const } }, { sku: { contains: w, mode: "insensitive" as const } }] })) }
      : undefined,
    select: { id: true, sku: true, description: true, priceA: true, sizeSpec: true },
    take: sizeDigits ? 500 : 2,
  });
  const pool = sizeDigits
    ? found.filter(x => `${x.sizeSpec ?? ""}|${x.sku}|${x.description}`.replace(/\D/g, "").includes(sizeDigits))
    : found;
  let p: (typeof pool)[number] | null = pool[0] ?? null;
  if (!p && sizeDigits && words.length) {
    const all = await db.product.findMany({ select: { id: true, sku: true, description: true, priceA: true, sizeSpec: true }, take: 4000 });
    p = all.find(x => `${x.sizeSpec ?? ""}|${x.sku}`.replace(/\D/g, "").includes(sizeDigits)) ?? null;
  }
  return p ? { ...p, priceA: p.priceA ? Number(p.priceA) : null } : null;
}

async function stockLine(p: MatchedProduct): Promise<string> {
  const inv = await db.inventorySnapshot.findMany({
    where: { productId: p.id },
    select: { quantity: true, location: { select: { shortTag: true } } },
  });
  const by: Record<string, number> = {};
  for (const i of inv) { const t = i.location?.shortTag ?? "?"; by[t] = (by[t] ?? 0) + i.quantity; }
  const parts = ["FL", "TX"].map(t => `${t} ${by[t] ?? 0}`).join(" / ");
  return `${p.sku} ${p.sizeSpec ?? ""} ${p.description.slice(0, 30)}\n  ${p.priceA !== null ? fmtMoney(p.priceA) : "no price"} · stock: ${parts}`;
}

// ---------------------------------------------------------------------------
// entry point for the SMS webhook
// ---------------------------------------------------------------------------
export async function processOwnerSms(rawText: string): Promise<OwnerSmsResult> {
  if (!process.env.ANTHROPIC_API_KEY) return { kind: "reply", text: "AI not configured on the server." };
  const parsed = await classify(rawText);

  if (parsed.intent === "price" || parsed.intent === "stock") {
    const items = (parsed.items ?? []).filter(i => i?.query).slice(0, 5);
    if (items.length === 0) return { kind: "reply", text: "Which product? Say size/brand, e.g. \"price 205-55-16 Zeetex\"." };
    const lines: string[] = [];
    for (const iq of items) {
      const p = await matchProduct(iq.query);
      lines.push(p ? await stockLine(p) : `⚠️ no match: ${iq.query}`);
    }
    return { kind: "reply", text: lines.join("\n") };
  }

  if (parsed.intent === "ar") {
    if (!parsed.customer) return { kind: "reply", text: "Which customer? e.g. \"BUDS AUTO owes?\"" };
    const customer = await matchCustomer(parsed.customer);
    // the invoice snapshot carries RAW TireGuru names too — inactive customers
    // never imported into the CRM are still queryable by name
    const invs = await db.invoice.findMany({
      where: customer
        ? { customerId: customer.id, balance: { not: 0 } }
        : { customerName: { contains: parsed.customer.trim(), mode: "insensitive" }, balance: { not: 0 } },
      select: { balance: true, dueDate: true, customerName: true },
    });
    const label = customer?.companyName ?? invs[0]?.customerName;
    if (!label) return { kind: "reply", text: `⚠️ no customer or open balance found for: ${parsed.customer}` };
    const now = Date.now();
    const total = invs.reduce((s, i) => s + Number(i.balance), 0);
    const pastDue = invs.filter(i => i.dueDate.getTime() < now && Number(i.balance) > 0).reduce((s, i) => s + Number(i.balance), 0);
    const oldest = invs.filter(i => Number(i.balance) > 0).reduce((d, i) => Math.min(d, i.dueDate.getTime()), now);
    const days = Math.floor((now - oldest) / 86400000);
    return {
      kind: "reply",
      text: `${label}${customer?.arWriteOffAt ? " (WRITTEN OFF)" : ""}\nBalance: ${fmtMoney(total)}\nPast due: ${fmtMoney(pastDue)}${days > 0 ? ` (oldest ${days}d)` : ""}\nOpen invoices: ${invs.length}`,
    };
  }

  if (parsed.intent === "order") {
    const order = await buildOrder(parsed);
    return { kind: "order", order };
  }

  return { kind: "reply", text: "I can take an order (\"order 4x 205-55-16 Zeetex for BUDS\"), check a price/stock, or a balance (\"BUDS owes?\")." };
}

async function buildOrder(parsed: Intent): Promise<ParsedOrder> {
  const custQuery = (parsed.customer ?? "").trim();
  const itemQueries = (parsed.items ?? []).filter(i => i?.query).slice(0, 12);
  if (!custQuery || itemQueries.length === 0) {
    return { ok: false, error: "missing customer or items", customerId: null, customerName: custQuery, locationId: null, items: [], notes: parsed.notes ?? null, total: null };
  }
  const customer = await matchCustomer(custQuery);
  const items: ParsedItem[] = [];
  for (const iq of itemQueries) {
    const qty = Math.max(1, Math.min(500, Math.round(iq.qty || 1)));
    const p = await matchProduct(iq.query);
    items.push(p
      ? { sku: p.sku, description: p.description, qty, price: p.priceA, matched: true }
      : { sku: null, description: iq.query, qty, price: null, matched: false });
  }
  const total = items.every(i => i.price !== null) ? items.reduce((s, i) => s + (i.price ?? 0) * i.qty, 0) : null;
  return {
    ok: true,
    customerId: customer?.id ?? null,
    customerName: customer?.companyName ?? custQuery,
    locationId: customer?.locationId ?? null,
    items,
    notes: parsed.notes ?? null,
    total,
  };
}

/** Confirmation SMS text for a parsed order. */
export function orderSummarySms(o: ParsedOrder, requestId: string): string {
  const lines = [
    `🛞 Order draft:`,
    `Customer: ${o.customerName}${o.customerId ? "" : " ⚠️(not found in CRM — will need manual pick)"}`,
    ...o.items.map(i => `• ${i.qty} × ${i.sku ?? "?"} ${i.description.slice(0, 40)}${i.price ? ` @${fmtMoney(i.price)}` : ""}${i.matched ? "" : " ⚠️no match"}`),
    o.total !== null ? `Total ~${fmtMoney(o.total)}` : "Total: TBD",
    o.notes ? `Note: ${o.notes}` : null,
    `Reply 1 to send to TireGuru, 0 to cancel. [#${requestId.slice(-6)}]`,
  ].filter(Boolean);
  return lines.join("\n");
}
