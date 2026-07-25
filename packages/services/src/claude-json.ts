/**
 * Minimal Claude JSON caller for batch/services use (no SDK dep — same
 * plain-fetch pattern as packages/database/scripts/ai-propose-specs.ts).
 */
const DEFAULT_MODEL = process.env.PROSPECT_AI_MODEL || "claude-haiku-4-5-20251001";

/**
 * Models often wrap the JSON in fences or append prose after it. Parse the
 * whole reply first; on failure fall back to the outermost {...} slice.
 */
export function parseJsonReply(text: string): unknown {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error(`Claude reply was not JSON: ${cleaned.slice(0, 120)}`);
  }
}

export async function askClaudeJson(opts: {
  system: string;
  user: string;
  maxTokens?: number;
  model?: string;
  fetchFn?: typeof fetch;
}): Promise<{ json: unknown; inputTokens: number; outputTokens: number }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  const f = opts.fetchFn ?? fetch;
  const res = await f("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: opts.model ?? DEFAULT_MODEL,
      max_tokens: opts.maxTokens ?? 1500,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = (await res.json()) as {
    content: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = body.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
  return {
    json: parseJsonReply(text),
    inputTokens: body.usage?.input_tokens ?? 0,
    outputTokens: body.usage?.output_tokens ?? 0,
  };
}
