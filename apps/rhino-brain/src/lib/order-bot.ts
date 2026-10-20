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

export type SmsTurn = { role: "user" | "assistant"; content: string };

async function classify(rawText: string, history: SmsTurn[] = []): Promise<Intent> {
  const anthropic = new Anthropic();
  const resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 700,
    system: `You parse a tire-wholesale owner's dictated SMS (English or Chinese) into JSON. Earlier turns of the SMS thread may be provided — use them to resolve follow-ups ("其他便宜的" / "what about 4 of those" inherit the size/brand/customer from context).
Intents:
- "order": he wants to PLACE an order for a customer ("order/下单/给X来4条").
- "price": he asks a price / best price / cheapest / 什么价 / 多少钱 for product(s).
- "stock": he asks availability / 有没有货 / 还有几条.
- "ar": he asks what a customer owes / balance / 欠款 / 账龄.
- "unknown": anything else.
Reply ONLY JSON: {"intent": "...", "customer": string|null (business name if mentioned or implied by context), "items": [{"query": string (product words: size/brand/sku — resolve from context when the new text only says "others/cheaper/those"), "qty": number}], "notes": string|null}.
Quantities: "4条"/"4 pcs"/"x4" → 4; if none said use 1. Never invent items. For "ar" items is [].`,
    messages: [...history.slice(-8), { role: "user", content: rawText }],
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

type MatchedProduct = { id: string; sku: string; description: string; brand: string | null; priceA: number | null; sizeSpec: string | null; fl: number; tx: number };

const PRODUCT_SELECT = { id: true, sku: true, description: true, brand: true, priceA: true, sizeSpec: true } as const;

/** All matches for a dictated product query, cheapest first, in-stock first.
 * Sizes arrive in any shape (205/55R17, 215-55-17, 215 55 17) → digits-only. */
async function matchProducts(q: string, limit: number): Promise<MatchedProduct[]> {
  const bySku = await db.product.findFirst({ where: { sku: { equals: q.trim(), mode: "insensitive" } }, select: PRODUCT_SELECT });
  let pool: { id: string; sku: string; description: string; brand: string | null; priceA: unknown; sizeSpec: string | null }[];
  if (bySku) pool = [bySku];
  else {
    const rawSize = (q.match(/(?:[a-zA-Z]{0,2})?\d{2,3}[\s\/xX.·-]{0,2}\d{2,3}[\s\/xXrRdD.·-]{0,2}\d{2}(?:\.\d)?|\d{2}[xX]\d{1,2}(?:\.\d+)?/) || [])[0];
    const sizeDigits = rawSize ? rawSize.replace(/\D/g, "") : null;
    const words = q.replace(rawSize ?? "\u0000", " ").split(/\s+/)
      .filter(w => w.length > 1 && !/^(cheapest|cheap|price|best|tires?|便宜|最便宜|价格?)$/i.test(w)).slice(0, 3);
    const found = await db.product.findMany({
      where: words.length
        ? { AND: words.map(w => ({ OR: [{ description: { contains: w, mode: "insensitive" as const } }, { brand: { contains: w, mode: "insensitive" as const } }, { sku: { contains: w, mode: "insensitive" as const } }] })) }
        : undefined,
      select: PRODUCT_SELECT,
      take: sizeDigits ? 800 : 5,
    });
    pool = sizeDigits
      ? found.filter(x => `${x.sizeSpec ?? ""}|${x.sku}|${x.description}`.replace(/\D/g, "").includes(sizeDigits))
      : found;
    // size given but the word filter (misheard brand) killed everything — size alone
    if (pool.length === 0 && sizeDigits && words.length) {
      const all = await db.product.findMany({ select: PRODUCT_SELECT, take: 4000 });
      pool = all.filter(x => `${x.sizeSpec ?? ""}|${x.sku}`.replace(/\D/g, "").includes(sizeDigits));
    }
  }
  if (pool.length === 0) return [];

  const inv = await db.inventorySnapshot.findMany({
    where: { productId: { in: pool.map(p => p.id) } },
    select: { productId: true, quantity: true, location: { select: { shortTag: true } } },
  });
  const stock: Record<string, { fl: number; tx: number }> = {};
  for (const i of inv) {
    const s = (stock[i.productId] ??= { fl: 0, tx: 0 });
    if (i.location?.shortTag === "TX") s.tx += i.quantity; else if (i.location?.shortTag === "FL") s.fl += i.quantity;
  }
  return pool
    .map(p => ({ ...p, priceA: p.priceA ? Number(p.priceA) : null, fl: stock[p.id]?.fl ?? 0, tx: stock[p.id]?.tx ?? 0 }))
    .sort((a, b) => {
      const aStock = a.fl + a.tx > 0 ? 0 : 1, bStock = b.fl + b.tx > 0 ? 0 : 1;
      if (aStock !== bStock) return aStock - bStock; // in-stock first
      return (a.priceA ?? 1e9) - (b.priceA ?? 1e9);  // then cheapest
    })
    .slice(0, limit);
}

const productLine = (p: MatchedProduct, i?: number) =>
  `${i !== undefined ? `${i + 1}. ` : ""}${p.brand ?? ""} ${p.sizeSpec ?? ""} ${p.description.slice(0, 26)}\n  ${p.priceA !== null ? fmtMoney(p.priceA) : "no price"} · FL ${p.fl} / TX ${p.tx} · ${p.sku}`;

// ---------------------------------------------------------------------------
// entry point for the SMS webhook
// ---------------------------------------------------------------------------
export async function processOwnerSms(rawText: string, history: SmsTurn[] = []): Promise<OwnerSmsResult> {
  if (!process.env.ANTHROPIC_API_KEY) return { kind: "reply", text: "AI not configured on the server." };
  const parsed = await classify(rawText, history);

  if (parsed.intent === "price" || parsed.intent === "stock") {
    const items = (parsed.items ?? []).filter(i => i?.query).slice(0, 3);
    if (items.length === 0) return { kind: "reply", text: "Which product? Say size/brand, e.g. \"price 205-55-16 Zeetex\"." };
    const blocks: string[] = [];
    for (const iq of items) {
      // one size queried → list the cheapest options across brands
      const matches = await matchProducts(iq.query, items.length === 1 ? 5 : 2);
      if (matches.length === 0) blocks.push(`⚠️ no match: ${iq.query}`);
      else blocks.push(matches.map((p, i) => productLine(p, matches.length > 1 ? i : undefined)).join("\n"));
    }
    return { kind: "reply", text: blocks.join("\n—\n") };
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
    const p = (await matchProducts(iq.query, 1))[0] ?? null;
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
