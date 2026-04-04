import type { GroqUsage } from "../groq/groqClient.js";

// Groq pricing: Llama 4 Scout
const GROQ_INPUT_RATE = 0.11 / 1_000_000;   // $0.11 per 1M input tokens
const GROQ_OUTPUT_RATE = 0.34 / 1_000_000;   // $0.34 per 1M output tokens

// E2B pricing: default sandbox (2vCPU + 2GB)
const E2B_RATE_PER_MS = 0.000118 / 1000;     // ~$0.000118/second → per-ms

// Business multipliers
export const PROFIT_MARGIN = 1.15;
export const PLATFORM_FEE_MULTIPLIER = 1 / 0.70; // Discord standard 30% cut

/**
 * Calculate the fully-adjusted estimated cost for a set of Groq calls
 * and an optional E2B execution.
 */
export function estimateCost(
  groqUsages: GroqUsage[],
  e2bDurationMs?: number
): number {
  let rawCost = 0;

  for (const usage of groqUsages) {
    rawCost += usage.promptTokens * GROQ_INPUT_RATE;
    rawCost += usage.completionTokens * GROQ_OUTPUT_RATE;
  }

  if (e2bDurationMs !== undefined && e2bDurationMs > 0) {
    rawCost += e2bDurationMs * E2B_RATE_PER_MS;
  }

  return rawCost * PROFIT_MARGIN * PLATFORM_FEE_MULTIPLIER;
}
