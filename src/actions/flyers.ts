"use server";

import Anthropic from "@anthropic-ai/sdk";
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

export async function generateFlyerCopy(input: {
  title: string;           // e.g. "July Specials"
  language: "en" | "es" | "both";
  tone: string;            // e.g. "bold and urgent" | "friendly"
  contactLine: string;
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
        content: `Flyer: "${input.title}". Contact: ${input.contactLine}\n\nProducts on special:\n${itemsText}\n\nReturn JSON exactly in this shape:\n{"headline": "big attention-grabbing headline (max 8 words)", "tagline": "one supporting line (max 14 words)", "intro": "1-2 short sentences to shop owners", "itemBlurbs": ["one punchy line per product, same order, max 12 words each — ${input.items.length} entries"], "footer": "one-line call to action mentioning limited time"}`,
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
