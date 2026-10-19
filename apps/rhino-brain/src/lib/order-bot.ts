import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { fmtMoney } from "./domain";

/**
 * SMS → TireGuru work-order bot (owner request 2026-10-19, "开车的时候下订单").
 * The owner texts an order in natural language (EN or 中文); Claude parses it,
 * we match the customer + products against the CRM (which mirrors TireGuru via
 * the 2h sync), and text back a confirmation summary. On "1" the request is
 * queued for the PC robot, which keys a WORK ORDER (non-financial) into
 * TireGuru Business Center.
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

const norm = (s: string) => s.toLowerCase().replace(/\s*&\s*/g, "&").replace(/\s+/g, " ").trim();

export async function parseOrderSms(rawText: string): Promise<ParsedOrder> {
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "AI not configured", customerId: null, customerName: "", locationId: null, items: [], notes: null, total: null };
  const anthropic = new Anthropic();

  // 1. AI: split the dictated text into a customer query + item queries
  const resp = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 800,
    system: `You parse a tire-wholesale owner's dictated order text (English or Chinese) into JSON.
Reply ONLY JSON: {"customer": string (the customer/business name as said), "items": [{"query": string (size/brand/product words, verbatim enough to search), "qty": number}], "notes": string|null (delivery instructions or anything else)}.
Quantities: "4条"/"4 tires"/"x4" → 4. If no qty said for an item, use 1. Never invent items.`,
    messages: [{ role: "user", content: rawText }],
  });
  const text = resp.content.filter(b => b.type === "text").map(b => (b.type === "text" ? b.text : "")).join("");
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { ok: false, error: "could not parse the order text", customerId: null, customerName: "", locationId: null, items: [], notes: null, total: null };
  const parsed = JSON.parse(jsonMatch[0]) as { customer?: string; items?: { query: string; qty: number }[]; notes?: string | null };
  const custQuery = (parsed.customer ?? "").trim();
  const itemQueries = (parsed.items ?? []).filter(i => i?.query).slice(0, 12);
  if (!custQuery || itemQueries.length === 0) {
    return { ok: false, error: "missing customer or items", customerId: null, customerName: custQuery, locationId: null, items: [], notes: parsed.notes ?? null, total: null };
  }

  // 2. Customer match (name contains, then word-overlap best effort)
  const candidates = await db.customer.findMany({
    where: { arWriteOffAt: null, status: { notIn: ["DO_NOT_CONTACT"] } },
    select: { id: true, companyName: true, locationId: true },
  });
  const nq = norm(custQuery);
  let customer = candidates.find(c => norm(c.companyName) === nq)
    ?? candidates.find(c => norm(c.companyName).includes(nq) || nq.includes(norm(c.companyName)));
  if (!customer) {
    const words = nq.split(" ").filter(w => w.length > 2);
    const scored = candidates
      .map(c => ({ c, score: words.filter(w => norm(c.companyName).includes(w)).length }))
      .filter(x => x.score >= Math.max(1, Math.ceil(words.length / 2)))
      .sort((a, b) => b.score - a.score);
    customer = scored[0]?.c;
  }

  // 3. Product match per item: SKU hit first, then size/description search
  const items: ParsedItem[] = [];
  for (const iq of itemQueries) {
    const q = iq.query.trim();
    const qty = Math.max(1, Math.min(500, Math.round(iq.qty || 1)));
    const bySku = await db.product.findFirst({ where: { sku: { equals: q, mode: "insensitive" } }, select: { sku: true, description: true, priceA: true } });
    let p: { sku: string; description: string; priceA: unknown } | null = bySku;
    if (!p) {
      // Sizes arrive in any dictated shape — 205/55R16, 205-55-16, 205 55 16,
      // ST235/80R16 — so match on DIGITS ONLY against sizeSpec/sku/description.
      const rawSize = (q.match(/(?:[a-zA-Z]{0,2})?\d{2,3}[\s\/xX.·-]{0,2}\d{2,3}[\s\/xXrRdD.·-]{0,2}\d{2}(?:\.\d)?|\d{2}[xX]\d{1,2}(?:\.\d+)?/) || [])[0];
      const sizeDigits = rawSize ? rawSize.replace(/\D/g, "") : null;
      const words = q.replace(rawSize ?? "\u0000", " ").split(/\s+/).filter(w => w.length > 1).slice(0, 3);
      const found = await db.product.findMany({
        where: words.length
          ? { AND: words.map(w => ({ OR: [{ description: { contains: w, mode: "insensitive" as const } }, { brand: { contains: w, mode: "insensitive" as const } }, { sku: { contains: w, mode: "insensitive" as const } }] })) }
          : undefined,
        select: { sku: true, description: true, priceA: true, sizeSpec: true, brand: true },
        take: sizeDigits ? 500 : 2,
      });
      const pool = sizeDigits
        ? found.filter(x => `${x.sizeSpec ?? ""}|${x.sku}|${x.description}`.replace(/\D/g, "").includes(sizeDigits))
        : found;
      p = pool[0] ?? null;
      // size given but the word filter was too strict (e.g. brand misheard) —
      // retry on size alone so "205-55-16" still finds 205/55R16 stock
      if (!p && sizeDigits && words.length) {
        const all = await db.product.findMany({ select: { sku: true, description: true, priceA: true, sizeSpec: true }, take: 4000 });
        p = all.find(x => `${x.sizeSpec ?? ""}|${x.sku}`.replace(/\D/g, "").includes(sizeDigits)) ?? null;
      }
    }
    items.push(p
      ? { sku: p.sku, description: p.description, qty, price: p.priceA ? Number(p.priceA) : null, matched: true }
      : { sku: null, description: q, qty, price: null, matched: false });
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
