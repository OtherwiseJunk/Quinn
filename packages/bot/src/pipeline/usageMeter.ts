import type { GroqUsage } from "../groq/groqClient.js";

// Groq per-token pricing. compound-mini rates are ESTIMATES (pricing is
// "passed through to underlying models") — verify against the first real
// invoices during Phase 3 rollout.
const RATES: Record<string, { input: number; output: number }> = {
  "meta-llama/llama-4-scout-17b-16e-instruct": { input: 0.11 / 1e6, output: 0.34 / 1e6 },
  "openai/gpt-oss-120b": { input: 0.15 / 1e6, output: 0.6 / 1e6 },
  "groq/compound-mini": { input: 0.59 / 1e6, output: 0.79 / 1e6 },
};
const DEFAULT_RATE = RATES["meta-llama/llama-4-scout-17b-16e-instruct"];

// Groq built-in search: $5–8 per 1k requests; assume the upper tier.
const WEB_SEARCH_FLAT = 0.008;

// E2B pricing: default sandbox (2vCPU + 2GB)
const E2B_RATE_PER_MS = 0.000118 / 1000;

// Business multipliers
export const PROFIT_MARGIN = 1.15;
export const PLATFORM_FEE_MULTIPLIER = 1 / 0.70; // Discord standard 30% cut

export function estimateCost(
  groqUsages: GroqUsage[],
  e2bDurationMs?: number,
  searchCount?: number,
): number {
  let rawCost = 0;

  for (const usage of groqUsages) {
    const rate = RATES[usage.model] ?? DEFAULT_RATE;
    rawCost += usage.promptTokens * rate.input;
    rawCost += usage.completionTokens * rate.output;
  }

  if (e2bDurationMs !== undefined && e2bDurationMs > 0) {
    rawCost += e2bDurationMs * E2B_RATE_PER_MS;
  }

  if (searchCount !== undefined && searchCount > 0) {
    rawCost += searchCount * WEB_SEARCH_FLAT;
  }

  return rawCost * PROFIT_MARGIN * PLATFORM_FEE_MULTIPLIER;
}
