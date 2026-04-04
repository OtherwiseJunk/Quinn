import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { shouldRespond } from "../responseDecision.js";
import type { ResolvedChannelConfig } from "@quinn/shared";

function makeConfig(overrides: Partial<ResolvedChannelConfig> = {}): ResolvedChannelConfig {
  return {
    guildId: "g1",
    channelId: "c1",
    respondIfMentioned: true,
    respondToAll: false,
    forbiddenWords: [],
    forbiddenWordReply: "",
    displayThoughts: false,
    activePrompt: null,
    responseRate: 50,
    ...overrides,
  };
}

describe("shouldRespond", () => {
  const originalRandom = Math.random;

  afterEach(() => {
    Math.random = originalRandom;
  });

  it("returns true when mentioned and respondIfMentioned is on", () => {
    expect(shouldRespond(makeConfig({ respondIfMentioned: true }), true)).toBe(true);
  });

  it("returns false when mentioned but respondIfMentioned is off", () => {
    expect(shouldRespond(makeConfig({ respondIfMentioned: false }), true)).toBe(false);
  });

  it("returns false when not mentioned and respondToAll is off", () => {
    expect(shouldRespond(makeConfig({ respondToAll: false }), false)).toBe(false);
  });

  it("returns true when respondToAll is on and random is below responseRate", () => {
    Math.random = () => 0.1; // 0.1 * 100 = 10 < 50
    expect(
      shouldRespond(makeConfig({ respondToAll: true, responseRate: 50 }), false)
    ).toBe(true);
  });

  it("returns false when respondToAll is on and random is above responseRate", () => {
    Math.random = () => 0.9; // 0.9 * 100 = 90 > 50
    expect(
      shouldRespond(makeConfig({ respondToAll: true, responseRate: 50 }), false)
    ).toBe(false);
  });
});
