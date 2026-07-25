/**
 * Minimal Claude JSON caller for batch/services use (no SDK dep — same
 * plain-fetch pattern as packages/database/scripts/ai-propose-specs.ts).
 */
const DEFAULT_MODEL = process.env.PROSPECT_AI_MODEL || "claude-haiku-4-5-20251001";

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
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  return {
    json: JSON.parse(cleaned),
    inputTokens: body.usage?.input_tokens ?? 0,
    outputTokens: body.usage?.output_tokens ?? 0,
  };
}
