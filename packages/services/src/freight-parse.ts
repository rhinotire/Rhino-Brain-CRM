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
