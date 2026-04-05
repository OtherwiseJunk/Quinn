import { describe, it, expect } from "bun:test";
import { resolveChannelConfig } from "../resolveChannelConfig.js";
import type { ServerConfig, ChannelConfig } from "@quinn/shared";

const baseServer: ServerConfig = {
  guildId: "guild-1",
  respondIfMentioned: true,
  respondToAll: false,
  forbiddenWords: ["badword"],
  forbiddenWordReply: "That word is not allowed here.",
  displayThoughts: false,
  serverPrompt: "Server prompt",
  responseRate: 25,
};

const baseChannel: ChannelConfig = {
  channelId: "channel-1",
  guildId: "guild-1",
  respondIfMentioned: null,
  respondToAll: null,
  forbiddenWords: [],
  responseRate: null,
  displayThoughts: null,
  channelPrompt: null,
};

describe("resolveChannelConfig", () => {
  it("uses server defaults when channel has no overrides", () => {
    const resolved = resolveChannelConfig(baseServer, baseChannel);
    expect(resolved.respondIfMentioned).toBe(true);
    expect(resolved.respondToAll).toBe(false);
    expect(resolved.displayThoughts).toBe(false);
    expect(resolved.responseRate).toBe(25);
    expect(resolved.activePrompt).toBe("Server prompt");
    expect(resolved.forbiddenWords).toEqual(["badword"]);
  });

  it("channel responseRate overrides server", () => {
    const channel = { ...baseChannel, responseRate: 60 };
    const resolved = resolveChannelConfig(baseServer, channel);
    expect(resolved.responseRate).toBe(60);
  });

  it("channel prompt overrides server prompt", () => {
    const channel = { ...baseChannel, channelPrompt: "Channel prompt" };
    const resolved = resolveChannelConfig(baseServer, channel);
    expect(resolved.activePrompt).toBe("Channel prompt");
  });

  it("channel forbidden words are merged with server forbidden words", () => {
    const channel = { ...baseChannel, forbiddenWords: ["otherword"] };
    const resolved = resolveChannelConfig(baseServer, channel);
    expect(resolved.forbiddenWords).toContain("badword");
    expect(resolved.forbiddenWords).toContain("otherword");
    expect(resolved.forbiddenWords).toHaveLength(2);
  });

  it("deduplicates forbidden words that appear in both lists", () => {
    const channel = { ...baseChannel, forbiddenWords: ["badword", "otherword"] };
    const resolved = resolveChannelConfig(baseServer, channel);
    expect(resolved.forbiddenWords.filter((w) => w === "badword")).toHaveLength(1);
  });

  it("server-level respondToAll=true overrides channel respondToAll=false", () => {
    const server = { ...baseServer, respondToAll: true };
    const channel = { ...baseChannel, respondToAll: false };
    const resolved = resolveChannelConfig(server, channel);
    expect(resolved.respondToAll).toBe(true);
  });

  it("server-level displayThoughts=true overrides channel displayThoughts=false", () => {
    const server = { ...baseServer, displayThoughts: true };
    const channel = { ...baseChannel, displayThoughts: false };
    const resolved = resolveChannelConfig(server, channel);
    expect(resolved.displayThoughts).toBe(true);
  });

  it("handles null channel gracefully", () => {
    const resolved = resolveChannelConfig(baseServer, null);
    expect(resolved.respondIfMentioned).toBe(true);
    expect(resolved.forbiddenWords).toEqual(["badword"]);
    expect(resolved.channelId).toBe("");
  });

  it("forbiddenWordReply always comes from the server config", () => {
    const resolved = resolveChannelConfig(baseServer, baseChannel);
    expect(resolved.forbiddenWordReply).toBe("That word is not allowed here.");
  });
});
