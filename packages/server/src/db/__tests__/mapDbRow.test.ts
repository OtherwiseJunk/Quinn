import { describe, it, expect } from "bun:test";
import {
  rowToServerConfig,
  rowToChannelConfig,
  rowToUserContext,
  rowToAdminUserContext,
  rowToForbiddenUser,
  rowToBotMemory,
} from "../mapDbRow.js";

describe("rowToServerConfig", () => {
  it("maps all snake_case columns to camelCase", () => {
    const row = {
      guild_id: "g1",
      respond_if_mentioned: true,
      respond_to_all: false,
      forbidden_words: ["bad"],
      forbidden_word_reply: "No.",
      display_thoughts: true,
      server_prompt: "Be nice",
      response_rate: 50,
    };
    expect(rowToServerConfig(row)).toEqual({
      guildId: "g1",
      respondIfMentioned: true,
      respondToAll: false,
      forbiddenWords: ["bad"],
      forbiddenWordReply: "No.",
      displayThoughts: true,
      serverPrompt: "Be nice",
      responseRate: 50,
    });
  });

  it("preserves null serverPrompt", () => {
    const row = {
      guild_id: "g1",
      respond_if_mentioned: false,
      respond_to_all: true,
      forbidden_words: [],
      forbidden_word_reply: "",
      display_thoughts: false,
      server_prompt: null,
      response_rate: 100,
    };
    expect(rowToServerConfig(row).serverPrompt).toBeNull();
  });
});

describe("rowToChannelConfig", () => {
  it("maps all columns including nullable optionals", () => {
    const row = {
      channel_id: "c1",
      guild_id: "g1",
      respond_if_mentioned: null,
      respond_to_all: true,
      forbidden_words: ["word"],
      response_rate: null,
      display_thoughts: null,
      channel_prompt: "Custom prompt",
    };
    expect(rowToChannelConfig(row)).toEqual({
      channelId: "c1",
      guildId: "g1",
      respondIfMentioned: null,
      respondToAll: true,
      forbiddenWords: ["word"],
      responseRate: null,
      displayThoughts: null,
      channelPrompt: "Custom prompt",
    });
  });

  it("preserves null optionals", () => {
    const row = {
      channel_id: "c2",
      guild_id: "g1",
      respond_if_mentioned: null,
      respond_to_all: null,
      forbidden_words: [],
      response_rate: null,
      display_thoughts: null,
      channel_prompt: null,
    };
    const result = rowToChannelConfig(row);
    expect(result.respondIfMentioned).toBeNull();
    expect(result.respondToAll).toBeNull();
    expect(result.responseRate).toBeNull();
    expect(result.displayThoughts).toBeNull();
    expect(result.channelPrompt).toBeNull();
  });
});

describe("rowToUserContext", () => {
  it("maps discord_user_id, context, updated_at", () => {
    const date = new Date("2024-01-01");
    const row = { discord_user_id: "u1", context: "I like cats", updated_at: date };
    expect(rowToUserContext(row)).toEqual({
      discordUserId: "u1",
      context: "I like cats",
      updatedAt: date,
    });
  });
});

describe("rowToAdminUserContext", () => {
  it("maps discord_user_id, guild_id, context, updated_at", () => {
    const date = new Date("2024-06-15");
    const row = {
      discord_user_id: "u2",
      guild_id: "g1",
      context: "Frequent troll",
      updated_at: date,
    };
    expect(rowToAdminUserContext(row)).toEqual({
      discordUserId: "u2",
      guildId: "g1",
      context: "Frequent troll",
      updatedAt: date,
    });
  });
});

describe("rowToForbiddenUser", () => {
  it("maps discord_user_id, guild_id, added_at", () => {
    const date = new Date("2024-03-20");
    const row = { discord_user_id: "u3", guild_id: "g2", added_at: date };
    expect(rowToForbiddenUser(row)).toEqual({
      discordUserId: "u3",
      guildId: "g2",
      addedAt: date,
    });
  });
});

describe("rowToBotMemory", () => {
  it("maps all columns including nullable subject_user_id", () => {
    const created = new Date("2024-01-01");
    const updated = new Date("2024-01-02");
    const row = {
      id: 42,
      guild_id: "g1",
      subject_user_id: "u5",
      content: "Likes pizza",
      created_at: created,
      updated_at: updated,
    };
    expect(rowToBotMemory(row)).toEqual({
      id: 42,
      guildId: "g1",
      subjectUserId: "u5",
      content: "Likes pizza",
      createdAt: created,
      updatedAt: updated,
    });
  });

  it("preserves null subject_user_id for self memories", () => {
    const row = {
      id: 1,
      guild_id: "g1",
      subject_user_id: null,
      content: "I like being sarcastic",
      created_at: new Date(),
      updated_at: new Date(),
    };
    expect(rowToBotMemory(row).subjectUserId).toBeNull();
  });
});
