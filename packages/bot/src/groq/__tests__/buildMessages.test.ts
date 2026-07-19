import { describe, it, expect, mock } from "bun:test";

mock.module("../../env.js", () => ({
  env: { e2bApiKey: undefined },
}));

// Stub E2B SDK so sandbox.ts doesn't fail to import
mock.module("@e2b/code-interpreter", () => ({
  Sandbox: { create: mock() },
}));

const { isThoughtMessage, buildMessages, stripImages } = await import("../buildMessages.js");
import type { GroqRequestContext, BotMemory } from "@quinn/shared";
import type { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions";

function fakeMessage(
  id: string,
  authorId: string,
  content: string,
  displayName = "TestUser"
) {
  return {
    id,
    content,
    author: { id: authorId, displayName, username: displayName },
    member: { displayName },
    attachments: new Map(),
    embeds: [],
  } as any;
}

function makeContext(overrides: Partial<GroqRequestContext> = {}): GroqRequestContext {
  return {
    systemPrompt: "You are Quinn.",
    serverPrompt: null,
    userContext: null,
    adminUserContext: null,
    contextMessageLimit: 25,
    ...overrides,
  };
}

let memoryIdCounter = 0;
function makeBotMemory(content: string, createdAt?: Date): BotMemory {
  return {
    id: ++memoryIdCounter,
    guildId: "g1",
    subjectUserId: null,
    content,
    createdAt: createdAt ?? new Date("2024-06-15T00:00:00Z"),
    updatedAt: new Date(),
  };
}

const BOT_ID = "bot-1";

describe("stripImages", () => {
  it("replaces image parts with a placeholder and flattens to string", () => {
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: "prompt" },
      {
        role: "user",
        content: [
          { type: "text", text: "alice: look at this" },
          { type: "image_url", image_url: { url: "https://cdn.example/img.png" } },
        ],
      },
    ];
    const stripped = stripImages(messages);
    expect(stripped[0]).toEqual({ role: "system", content: "prompt" });
    expect(stripped[1].content).toBe("alice: look at this\n[user posted an image]");
  });

  it("leaves plain string messages untouched", () => {
    const messages: ChatCompletionMessageParam[] = [
      { role: "user", content: "bob: hello" },
      { role: "assistant", content: "hi bob" },
    ];
    expect(stripImages(messages)).toEqual(messages);
  });

  it("uses one placeholder per image", () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: "user",
        content: [
          { type: "text", text: "carol: two pics" },
          { type: "image_url", image_url: { url: "https://a/1.png" } },
          { type: "image_url", image_url: { url: "https://a/2.png" } },
        ],
      },
    ];
    const stripped = stripImages(messages);
    expect(stripped[0].content).toBe("carol: two pics\n[user posted an image]\n[user posted an image]");
  });
});

describe("slim system message", () => {
  it("no longer embeds the JSON schema", () => {
    const context = {
      systemPrompt: "You are Quinn.",
      serverPrompt: null,
      userContext: null,
      adminUserContext: null,
      contextMessageLimit: 25,
    };
    const messages = buildMessages(context, [], fakeMessage("hello", "u1", "hello"), BOT_ID);
    const system = messages[0];
    expect(typeof system.content).toBe("string");
    expect(system.content as string).not.toContain("should_respond");
    expect(system.content as string).not.toContain("run_code");
    expect(system.content as string).toContain("You act by calling tools");
  });
});

describe("isThoughtMessage", () => {
  it("returns true for triple-backtick wrapped content", () => {
    const msg = fakeMessage("1", BOT_ID, "```this is a thought```");
    expect(isThoughtMessage(msg)).toBe(true);
  });

  it("returns false for normal content", () => {
    const msg = fakeMessage("2", BOT_ID, "Hello world");
    expect(isThoughtMessage(msg)).toBe(false);
  });

  it("returns false for partial backticks", () => {
    const msg = fakeMessage("3", BOT_ID, "```not closed");
    expect(isThoughtMessage(msg)).toBe(false);
  });
});

describe("buildMessages", () => {
  it("system prompt is first message (role: system)", () => {
    const trigger = fakeMessage("t1", "u1", "Hello");
    const msgs = buildMessages(makeContext(), [], trigger, BOT_ID);
    expect(msgs[0].role).toBe("system");
    expect((msgs[0] as any).content).toContain("You are Quinn.");
  });

  it("appends server prompt when present", () => {
    const ctx = makeContext({ serverPrompt: "Be extra nice" });
    const trigger = fakeMessage("t1", "u1", "Hello");
    const msgs = buildMessages(ctx, [], trigger, BOT_ID);
    expect((msgs[0] as any).content).toContain("Be extra nice");
  });

  it("appends tool-calling guidance to system prompt", () => {
    const trigger = fakeMessage("t1", "u1", "Hello");
    const msgs = buildMessages(makeContext(), [], trigger, BOT_ID);
    expect((msgs[0] as any).content).toContain("You act by calling tools");
    expect((msgs[0] as any).content).toContain("Never answer with plain text");
  });

  it("does not include JSON schema in slimmed system message", () => {
    const trigger = fakeMessage("t1", "u1", "Hello");
    const msgs = buildMessages(makeContext(), [], trigger, BOT_ID);
    expect((msgs[0] as any).content).not.toContain("should_respond");
    expect((msgs[0] as any).content).not.toContain("valid JSON");
  });

  it("injects user/admin context as user+assistant pair", () => {
    const ctx = makeContext({
      userContext: "I'm a cat person",
      adminUserContext: "Known troll",
    });
    const trigger = fakeMessage("t1", "u1", "Hello");
    const msgs = buildMessages(ctx, [], trigger, BOT_ID);

    const contextMsg = msgs.find(
      (m) => m.role === "user" && (m as any).content.includes("cat person")
    );
    expect(contextMsg).toBeDefined();
    expect((contextMsg as any).content).toContain("Known troll");

    // Should have an assistant acknowledgment right after
    const idx = msgs.indexOf(contextMsg!);
    expect(msgs[idx + 1].role).toBe("assistant");
    expect((msgs[idx + 1] as any).content).toContain("context in mind");
  });

  it("skips context pair when no user/admin context", () => {
    const trigger = fakeMessage("t1", "u1", "Hello");
    const msgs = buildMessages(makeContext(), [], trigger, BOT_ID);
    const contextPair = msgs.filter(
      (m) =>
        m.role === "assistant" && (m as any).content.includes("context in mind")
    );
    expect(contextPair).toHaveLength(0);
  });

  it("injects self memories + user memories as user+assistant pair", () => {
    const trigger = fakeMessage("t1", "u1", "Hello");
    const selfMem = [makeBotMemory("I like sarcasm")];
    const userMem = [
      { ...makeBotMemory("They like cats"), subjectUserId: "u1" },
    ];
    const msgs = buildMessages(makeContext(), [], trigger, BOT_ID, selfMem, userMem);

    const memoryMsg = msgs.find(
      (m) => m.role === "user" && (m as any).content.includes("I like sarcasm")
    );
    expect(memoryMsg).toBeDefined();
    expect((memoryMsg as any).content).toContain("like cats");

    const idx = msgs.indexOf(memoryMsg!);
    expect(msgs[idx + 1].role).toBe("assistant");
    expect((msgs[idx + 1] as any).content).toContain("memories in mind");
  });

  it("formats memories with ID and saved date", () => {
    const trigger = fakeMessage("t1", "u1", "Hello");
    const mem = makeBotMemory("Likes cats", new Date("2024-01-15T12:00:00Z"));
    const msgs = buildMessages(makeContext(), [], trigger, BOT_ID, [mem]);

    const memoryMsg = msgs.find(
      (m) => m.role === "user" && (m as any).content.includes("Likes cats")
    );
    expect(memoryMsg).toBeDefined();
    expect((memoryMsg as any).content).toContain(`[#${mem.id}, saved 2024-01-15]`);
  });

  it("maps bot messages to assistant role, others to user role with timestamped name (id) labels", () => {
    const NOW = 1_000_000_000_000;
    const h1 = fakeMessage("h1", "u1", "Hey Quinn", "Alice");
    h1.createdTimestamp = NOW - 30_000;
    const h2 = fakeMessage("h2", BOT_ID, "Hey there!");
    h2.createdTimestamp = NOW - 20_000;
    const trigger = fakeMessage("t1", "u1", "What's up?", "Alice");
    trigger.createdTimestamp = NOW;
    const msgs = buildMessages(makeContext(), [h1, h2], trigger, BOT_ID, undefined, undefined, undefined, undefined, NOW);

    const userMsg = msgs.find(
      (m) => m.role === "user" && (m as any).content === "[just now] Alice (u1): Hey Quinn"
    );
    expect(userMsg).toBeDefined();

    const assistantMsg = msgs.find(
      (m) => m.role === "assistant" && (m as any).content === "Hey there!"
    );
    expect(assistantMsg).toBeDefined();
  });

  it("filters out thought messages from history", () => {
    const history = [
      fakeMessage("h1", BOT_ID, "```thinking about something```"),
      fakeMessage("h2", BOT_ID, "Normal reply"),
    ];
    const trigger = fakeMessage("t1", "u1", "Hello");
    const msgs = buildMessages(makeContext(), history, trigger, BOT_ID);

    const thoughtMsg = msgs.find((m) =>
      (m as any).content?.includes("thinking about something")
    );
    expect(thoughtMsg).toBeUndefined();

    const normalMsg = msgs.find(
      (m) => m.role === "assistant" && (m as any).content === "Normal reply"
    );
    expect(normalMsg).toBeDefined();
  });

  it("always places the trigger last, labeled name (id), untimestamped", () => {
    const trigger = fakeMessage("t1", "u1", "Hello!", "Alice");
    const msgs = buildMessages(makeContext(), [], trigger, BOT_ID);

    const lastMsg = msgs[msgs.length - 1];
    expect(lastMsg.role).toBe("user");
    expect((lastMsg as any).content).toBe("Alice (u1): Hello!");
  });

  it("does not duplicate trigger if already in history, and inserts the context divider", () => {
    const NOW = 1_000_000_000_000;
    const trigger = fakeMessage("t1", "u1", "Hello!", "Alice");
    trigger.createdTimestamp = NOW;
    const earlier = fakeMessage("m1", "u2", "old question?", "Bob");
    earlier.createdTimestamp = NOW - 5 * 60_000;
    const msgs = buildMessages(makeContext(), [earlier, trigger], trigger, BOT_ID, undefined, undefined, undefined, undefined, NOW);

    const triggerMsgs = msgs.filter(
      (m) => m.role === "user" && (m as any).content === "Alice (u1): Hello!"
    );
    expect(triggerMsgs).toHaveLength(1);
    expect((msgs[msgs.length - 1] as any).content).toBe("Alice (u1): Hello!");

    const historyMsg = msgs.find((m) => ((m as any).content as string)?.includes("old question?"));
    expect((historyMsg as any).content).toBe("[5m ago] Bob (u2): old question?");

    const divider = msgs[msgs.length - 2];
    expect((divider as any).content).toContain("Respond ONLY to the following message");
  });

  it("omits the context divider when there is no history", () => {
    const trigger = fakeMessage("t1", "u1", "Hello!", "Alice");
    const msgs = buildMessages(makeContext(), [], trigger, BOT_ID);
    const dividers = msgs.filter((m) =>
      m.role !== "system" &&
      typeof (m as any).content === "string" &&
      ((m as any).content as string).includes("Respond ONLY")
    );
    expect(dividers).toHaveLength(0);
  });

  it("puts the current date/time at the top of the system message", () => {
    const NOW = Date.UTC(2026, 6, 6, 12, 0, 0);
    const trigger = fakeMessage("t1", "u1", "Hello!", "Alice");
    const msgs = buildMessages(makeContext(), [], trigger, BOT_ID, undefined, undefined, undefined, undefined, NOW);
    expect((msgs[0] as any).content).toStartWith("Current date and time: Mon, 06 Jul 2026 12:00:00 GMT");
  });
});
