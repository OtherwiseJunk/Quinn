import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { getTemperature, recordMessage } from "../temperament.js";

describe("temperament", () => {
  const originalDateNow = Date.now;

  // We need to clear the module-level timestamps array between tests.
  // Since it's not exported, we re-import via a fresh module each describe block.
  // However, for simplicity we can work around by advancing time past the window.
  beforeEach(() => {
    // Advance time 11 minutes past any previously recorded messages to prune them
    const future = originalDateNow() + 11 * 60 * 1000;
    Date.now = () => future;
    getTemperature(); // triggers pruning of all old entries
    // Restore real time for the actual test
    Date.now = originalDateNow;
  });

  afterEach(() => {
    Date.now = originalDateNow;
  });

  it("returns 0.7 (BASE_TEMP) when no messages recorded", () => {
    // After pruning in beforeEach, there should be no messages
    const temp = getTemperature();
    expect(temp).toBeCloseTo(0.7, 5);
  });

  it("increases by ~0.06 per recorded message", () => {
    recordMessage();
    recordMessage();
    const temp = getTemperature();
    expect(temp).toBeCloseTo(0.7 + 2 * 0.06, 5);
  });

  it("caps at 1.3 (MAX_TEMP)", () => {
    for (let i = 0; i < 20; i++) recordMessage();
    const temp = getTemperature();
    expect(temp).toBe(1.3);
  });

  it("prunes messages older than 10 minutes", () => {
    const baseTime = originalDateNow();

    // Record a message at "base" time
    Date.now = () => baseTime;
    recordMessage();

    // Advance time by 11 minutes — the recorded message should be pruned
    Date.now = () => baseTime + 11 * 60 * 1000;
    const temp = getTemperature();
    expect(temp).toBeCloseTo(0.7, 5);
  });
});
