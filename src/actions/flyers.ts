"use server";

import Anthropic from "@anthropic-ai/sdk";
import { subDays } from "date-fns";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/auth";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

export type FlyerItemInput = {
  name: string;        // size / product name, e.g. "ST205/75R15"
  description: string;
  wasPrice?: string;
  specialPrice: string;
};

export type FlyerCopy = {
  headline: string;
  tagline: string;
  intro: string;
  itemBlurbs: string[]; // one per item, same order
  footer: string;
};

export type SuggestedProduct = {
  name: string;
  description: string;
  reason: string;     // why this product should be on the flyer
  stockNote: string;
};

/**
 * Picks products worth promoting, in priority order:
 * 1. DISCONTINUED items still holding stock — clear them out first
 * 2. DEAD STOCK — most capital tied up (qty × cost) with no demand signals
 *    (no quotes and no lost-sale requests in 90 days)
 * 3. OVERSTOCK — remaining high-quantity items
 * Bonus: lost-sale win-backs are appended if slots remain.
 */
export async function suggestFlyerProducts(): Promise<{ ok?: boolean; items?: SuggestedProduct[]; error?: string }> {
  await requireManager();
  const MAX = 8;

  const picks: SuggestedProduct[] = [];
  const seen = new Set<string>();
  const stockNote = (inv: { quantity: number; location: { shortTag: string } }[]) =>
    inv.filter(i => i.quantity > 0).map(i => `${i.location.shortTag}: ${i.quantity}`).join(" · ") || "no stock";

  const withStock = { inventory: { some: { quantity: { gt: 0 } } } };
  const inc = { inventory: { include: { location: { select: { shortTag: true } } } } };
  const qtyOf = (p: { inventory: { quantity: number }[] }) => p.inventory.reduce((s, i) => s + i.quantity, 0);

  // demand signals from the last 90 days (used to decide what counts as "dead")
  const since = subDays(new Date(), 90);
  const [quoteItems, lostRecent] = await Promise.all([
    db.quoteItem.findMany({ where: { quote: { quoteDate: { gte: since } } }, select: { sizeSku: true, description: true } }),
    db.lostSale.findMany({ where: { occurredAt: { gte: since } }, orderBy: { estValue: "desc" }, select: { item: true, reason: true, customerName: true } }),
  ]);
  const demandText = (quoteItems.map(q => `${q.sizeSku ?? ""} ${q.description}`).join(" | ") + " | " +
    lostRecent.map(l => l.item).join(" | ")).toLowerCase();
  const hasDemand = (p: { sizeSpec: string | null; sku: string }) => {
    const size = p.sizeSpec?.toLowerCase();
    return (size && size.length >= 4 && demandText.includes(size)) || demandText.includes(p.sku.toLowerCase());
  };

  // ---- 1. Discontinued with stock: clearance first ----
  const disc = await db.product.findMany({ where: { active: true, discontinued: true, ...withStock }, include: inc });
  for (const p of disc.sort((a, b) => qtyOf(b) * Number(b.cost ?? 0) - qtyOf(a) * Number(a.cost ?? 0))) {
    if (picks.length >= MAX) break;
    seen.add(p.id);
    picks.push({
      name: p.sizeSpec ?? p.sku,
      description: p.description,
      reason: `DISCONTINUED — clear the remaining ${qtyOf(p)} units${p.cost ? ` ($${Math.round(qtyOf(p) * Number(p.cost)).toLocaleString()} tied up)` : ""}`,
      stockNote: stockNote(p.inventory),
    });
  }

  // ---- 2. Dead stock: capital sitting with zero demand signals in 90d ----
  if (picks.length < MAX) {
    const candidates = await db.product.findMany({
      where: { active: true, discontinued: false, cost: { not: null }, ...withStock },
      include: inc,
    });
    const dead = candidates
      .map(p => ({ p, qty: qtyOf(p), capital: qtyOf(p) * Number(p.cost) }))
      .filter(x => x.qty >= 8 && !hasDemand(x.p))
      .sort((a, b) => b.capital - a.capital);
    for (const { p, qty, capital } of dead) {
      if (picks.length >= MAX) break;
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      picks.push({
        name: p.sizeSpec ?? p.sku,
        description: p.description,
        reason: `dead stock — $${Math.round(capital).toLocaleString()} sitting (${qty} units), no quotes or requests in 90 days`,
        stockNote: stockNote(p.inventory),
      });
    }
  }

  // ---- 3. Overstock: remaining high-quantity items ----
  if (picks.length < MAX) {
    const over = await db.inventorySnapshot.findMany({
      where: { quantity: { gt: 20 } },
      orderBy: { quantity: "desc" }, take: 30,
      include: { product: { include: inc }, location: { select: { shortTag: true } } },
    });
    for (const s of over) {
      if (picks.length >= MAX) break;
      if (!s.product.active || seen.has(s.product.id)) continue;
      seen.add(s.product.id);
      picks.push({
        name: s.product.sizeSpec ?? s.product.sku,
        description: s.product.description,
        reason: `overstock — ${s.quantity} units in ${s.location.shortTag}, free up warehouse space`,
        stockNote: stockNote(s.product.inventory),
      });
    }
  }

  // ---- Bonus: win-backs if there is still room ----
  for (const l of lostRecent) {
    if (picks.length >= MAX) break;
    const item = l.item.trim();
    if (!item || item === "(unspecified)") continue;
    const p = await db.product.findFirst({
      where: {
        active: true, ...withStock,
        OR: [{ sizeSpec: { contains: item, mode: "insensitive" } }, { sku: { contains: item, mode: "insensitive" } }],
      },
      include: inc,
    });
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    picks.push({
      name: p.sizeSpec ?? p.sku,
      description: p.description,
      reason: l.reason === "PRICE"
        ? `win-back — lost to competitor price (${l.customerName})`
        : `win-back — ${l.customerName} asked for this, now in stock`,
      stockNote: stockNote(p.inventory),
    });
  }

  if (picks.length === 0) return { error: "No candidates — mark discontinued items on the Products page or import fresh inventory first." };
  return { ok: true, items: picks };
}

export async function generateFlyerCopy(input: {
  title: string;           // e.g. "July Specials"
  language: "en" | "es" | "both";
  tone: string;            // e.g. "bold and urgent" | "friendly"
  contactLine: string;
  notes?: string;          // theme / extra instructions from the owner
  items: FlyerItemInput[];
}): Promise<{ ok?: boolean; copy?: FlyerCopy; error?: string }> {
  await requireManager();
  if (!process.env.ANTHROPIC_API_KEY) return { error: "AI is not configured — ANTHROPIC_API_KEY missing." };
  if (input.items.length === 0) return { error: "Add at least one product to the flyer." };

  const langNote =
    input.language === "es" ? "Write ALL text in Spanish (Latin American, natural for tire shop owners)."
    : input.language === "both" ? "Write every text element bilingual: English first, then a slash, then Spanish. Keep each language part short."
    : "Write in English.";

  const itemsText = input.items.map((it, i) =>
    `${i + 1}. ${it.name} — ${it.description}${it.wasPrice ? ` (was $${it.wasPrice})` : ""} NOW $${it.specialPrice}`
  ).join("\n");

  try {
    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: `You write punchy wholesale-tire promo flyers for Rhino Tire USA (Orlando, FL) and Everflow Tire (Dallas, TX). Audience: tire shop owners, car dealers, fleets. Tone: ${input.tone}. ${langNote} Never invent prices or products. Reply ONLY with valid JSON, no markdown fences.`,
      messages: [{
        role: "user",
        content: `Flyer: "${input.title}". Contact: ${input.contactLine}${input.notes?.trim() ? `\n\nTheme / instructions from the owner (follow these closely): ${input.notes.trim()}` : ""}\n\nProducts on special:\n${itemsText}\n\nReturn JSON exactly in this shape:\n{"headline": "big attention-grabbing headline (max 8 words)", "tagline": "one supporting line (max 14 words)", "intro": "1-2 short sentences to shop owners", "itemBlurbs": ["one punchy line per product, same order, max 12 words each — ${input.items.length} entries"], "footer": "one-line call to action mentioning limited time"}`,
      }],
    });
    const text = response.content.filter(b => b.type === "text").map(b => (b.type === "text" ? b.text : "")).join("").trim();
    const jsonStr = text.replace(/^```(json)?/m, "").replace(/```$/m, "").trim();
    const copy = JSON.parse(jsonStr) as FlyerCopy;
    if (!copy.headline || !Array.isArray(copy.itemBlurbs)) throw new Error("bad shape");
    while (copy.itemBlurbs.length < input.items.length) copy.itemBlurbs.push("");
    return { ok: true, copy };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { error: "AI key is invalid — check ANTHROPIC_API_KEY." };
    if (e instanceof Anthropic.APIError) return { error: `AI error: ${e.message}` };
    return { error: "AI returned an unexpected format — try again." };
  }
}
