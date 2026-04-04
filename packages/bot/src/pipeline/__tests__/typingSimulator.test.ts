import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { calculateTypingDelay } from "../typingSimulator.js";

describe("calculateTypingDelay", () => {
  const originalRandom = Math.random;

  beforeEach(() => {
    Math.random = () => 0.5; // variance = (0.5 - 0.5) * 1000 = 0
  });

  afterEach(() => {
    Math.random = originalRandom;
  });

  it("returns >= 500ms for empty content", () => {
    const result = calculateTypingDelay(0);
    expect(result).toBeGreaterThanOrEqual(500);
  });

  it("returns <= 15000ms for very long content", () => {
    const result = calculateTypingDelay(10_000);
    expect(result).toBeLessThanOrEqual(15_000);
  });

  it("scales with content length", () => {
    const short = calculateTypingDelay(5);
    const long = calculateTypingDelay(100);
    expect(long).toBeGreaterThan(short);
  });

  it("returns exactly base value when Math.random is 0.5 (no variance)", () => {
    // base = 10 * 50 = 500, variance = 0, clamped to [500, 15000] → 500
    expect(calculateTypingDelay(10)).toBe(500);
  });
});
