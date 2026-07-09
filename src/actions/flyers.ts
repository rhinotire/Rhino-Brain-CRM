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
 * Picks products worth promoting this month:
 * 1. sizes customers asked for and we lost the sale (win-back / price-sensitive)
 * 2. highest-stock items (move overstock)
 */
export async function suggestFlyerProducts(): Promise<{ ok?: boolean; items?: SuggestedProduct[]; error?: string }> {
  await requireManager();

  const picks: SuggestedProduct[] = [];
  const seen = new Set<string>();
  const stockNote = (inv: { quantity: number; location: { shortTag: string } }[]) =>
    inv.filter(i => i.quantity > 0).map(i => `${i.location.shortTag}: ${i.quantity}`).join(" · ") || "no stock";

  // 1. Lost-sale demand from the last 60 days, matched back to the catalog
  const lost = await db.lostSale.findMany({
    where: { occurredAt: { gte: subDays(new Date(), 60) } },
    orderBy: { estValue: "desc" },
    take: 30,
    select: { item: true, reason: true, customerName: true },
  });
  for (const l of lost) {
    if (picks.length >= 5) break;
    const item = l.item.trim();
    if (!item || item === "(unspecified)") continue;
    const p = await db.product.findFirst({
      where: {
        active: true,
        OR: [{ sizeSpec: { contains: item, mode: "insensitive" } }, { sku: { contains: item, mode: "insensitive" } }],
        inventory: { some: { quantity: { gt: 0 } } },
      },
      include: { inventory: { include: { location: { select: { shortTag: true } } } } },
    });
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    picks.push({
      name: p.sizeSpec ?? p.sku,
      description: p.description,
      reason: l.reason === "PRICE"
        ? `lost to competitor price (${l.customerName}) — win it back with a special`
        : `customers asked for this and we lost the sale (${l.customerName}) — now in stock`,
      stockNote: stockNote(p.inventory),
    });
  }

  // 2. Top overstock items to move
  const overstock = await db.inventorySnapshot.findMany({
    where: { quantity: { gt: 20 } },
    orderBy: { quantity: "desc" },
    take: 20,
    include: {
      product: { include: { inventory: { include: { location: { select: { shortTag: true } } } } } },
      location: { select: { shortTag: true } },
    },
  });
  for (const s of overstock) {
    if (picks.length >= 8) break;
    if (!s.product.active || seen.has(s.product.id)) continue;
    seen.add(s.product.id);
    picks.push({
      name: s.product.sizeSpec ?? s.product.sku,
      description: s.product.description,
      reason: `overstock — ${s.quantity} units sitting in ${s.location.shortTag}, free up warehouse space`,
      stockNote: stockNote(s.product.inventory),
    });
  }

  if (picks.length === 0) return { error: "No candidates found — log some lost sales or import fresh inventory first." };
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
