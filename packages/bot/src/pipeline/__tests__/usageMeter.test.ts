import { describe, it, expect } from "bun:test";
import { estimateCost, PROFIT_MARGIN, PLATFORM_FEE_MULTIPLIER } from "../usageMeter.js";

const GROQ_INPUT_RATE = 0.11 / 1_000_000;
const GROQ_OUTPUT_RATE = 0.34 / 1_000_000;
const E2B_RATE_PER_MS = 0.000118 / 1000;
const MULTIPLIER = PROFIT_MARGIN * PLATFORM_FEE_MULTIPLIER;

describe("estimateCost", () => {
  it("returns 0 for no usage", () => {
    expect(estimateCost([])).toBe(0);
  });

  it("calculates cost for a single Groq call", () => {
    const usage = [{ promptTokens: 1000, completionTokens: 500 }];
    const rawCost = 1000 * GROQ_INPUT_RATE + 500 * GROQ_OUTPUT_RATE;
    const expected = rawCost * MULTIPLIER;
    expect(estimateCost(usage)).toBeCloseTo(expected, 10);
  });

  it("accumulates multiple Groq calls", () => {
    const usages = [
      { promptTokens: 1000, completionTokens: 200 },
      { promptTokens: 1500, completionTokens: 300 },
    ];
    const rawCost =
      (1000 + 1500) * GROQ_INPUT_RATE + (200 + 300) * GROQ_OUTPUT_RATE;
    const expected = rawCost * MULTIPLIER;
    expect(estimateCost(usages)).toBeCloseTo(expected, 10);
  });

  it("includes E2B cost when durationMs is provided", () => {
    const usage = [{ promptTokens: 500, completionTokens: 100 }];
    const e2bMs = 5000;
    const rawCost =
      500 * GROQ_INPUT_RATE + 100 * GROQ_OUTPUT_RATE + e2bMs * E2B_RATE_PER_MS;
    const expected = rawCost * MULTIPLIER;
    expect(estimateCost(usage, e2bMs)).toBeCloseTo(expected, 10);
  });

  it("ignores E2B when durationMs is 0", () => {
    const usage = [{ promptTokens: 100, completionTokens: 50 }];
    expect(estimateCost(usage, 0)).toBe(estimateCost(usage));
  });

  it("applies profit margin and platform fee correctly", () => {
    // 1M input tokens + 1M output tokens
    const usage = [{ promptTokens: 1_000_000, completionTokens: 1_000_000 }];
    const rawCost = 0.11 + 0.34; // $0.45
    const expected = rawCost * 1.15 * (1 / 0.70);
    expect(estimateCost(usage)).toBeCloseTo(expected, 8);
  });
});
