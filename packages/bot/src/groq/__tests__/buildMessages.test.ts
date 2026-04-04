import { describe, it, expect, mock } from "bun:test";

mock.module("../../env.js", () => ({
  env: { e2bApiKey: undefined },
}));

// Stub E2B SDK so sandbox.ts doesn't fail to import
mock.module("@e2b/code-interpreter", () => ({
  Sandbox: { create: mock() },
}));

const { isThoughtMessage, buildMessages, buildSecondPassMessages } = await import("../buildMessages.js");
import type { GroqRequestContext, BotMemory } from "@quinn/shared";
import type { CodeResult } from "../../e2b/sandbox.js";

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

  it("appends JSON schema reminder when system prompt lacks 'json'", () => {
    const trigger = fakeMessage("t1", "u1", "Hello");
    const msgs = buildMessages(makeContext(), [], trigger, BOT_ID);
    expect((msgs[0] as any).content).toContain("valid JSON");
  });

  it("skips JSON reminder when prompt contains 'json'", () => {
    const ctx = makeContext({ systemPrompt: "Return json always." });
    const trigger = fakeMessage("t1", "u1", "Hello");
    const msgs = buildMessages(ctx, [], trigger, BOT_ID);
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

  it("maps bot messages to assistant role, others to user role with displayName: content", () => {
    const history = [
      fakeMessage("h1", "u1", "Hey Quinn", "Alice"),
      fakeMessage("h2", BOT_ID, "Hey there!"),
    ];
    const trigger = fakeMessage("t1", "u1", "What's up?", "Alice");
    const msgs = buildMessages(makeContext(), history, trigger, BOT_ID);

    const userMsg = msgs.find(
      (m) => m.role === "user" && (m as any).content === "Alice: Hey Quinn"
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

  it("appends trigger message if not already in history", () => {
    const trigger = fakeMessage("t1", "u1", "Hello!", "Alice");
    const msgs = buildMessages(makeContext(), [], trigger, BOT_ID);

    const lastMsg = msgs[msgs.length - 1];
    expect(lastMsg.role).toBe("user");
    expect((lastMsg as any).content).toBe("Alice: Hello!");
  });

  it("does not duplicate trigger if already in history", () => {
    const trigger = fakeMessage("t1", "u1", "Hello!", "Alice");
    const history = [trigger];
    const msgs = buildMessages(makeContext(), history, trigger, BOT_ID);

    const matchingMsgs = msgs.filter(
      (m) => m.role === "user" && (m as any).content === "Alice: Hello!"
    );
    expect(matchingMsgs).toHaveLength(1);
  });
});

describe("buildSecondPassMessages", () => {
  const baseMessages = [
    { role: "system" as const, content: "You are Quinn." },
    { role: "user" as const, content: "Alice: What is 2^100?" },
  ];

  const runCode = { language: "python" as const, code: "print(2**100)" };

  it("starts with all original messages", () => {
    const result: CodeResult = { success: true, stdout: "1267650600228229401496703205376", stderr: "", durationMs: 100 };
    const msgs = buildSecondPassMessages(baseMessages, runCode, result);

    expect(msgs[0]).toEqual(baseMessages[0]);
    expect(msgs[1]).toEqual(baseMessages[1]);
  });

  it("adds assistant message with code intent", () => {
    const result: CodeResult = { success: true, stdout: "42", stderr: "", durationMs: 100 };
    const msgs = buildSecondPassMessages(baseMessages, runCode, result);

    const assistantMsg = msgs[2];
    expect(assistantMsg.role).toBe("assistant");
    expect((assistantMsg as any).content).toContain("python");
    expect((assistantMsg as any).content).toContain("print(2**100)");
  });

  it("adds user message with execution result and no-recurse instruction", () => {
    const result: CodeResult = { success: true, stdout: "42", stderr: "", durationMs: 100 };
    const msgs = buildSecondPassMessages(baseMessages, runCode, result);

    const lastMsg = msgs[msgs.length - 1];
    expect(lastMsg.role).toBe("user");
    expect((lastMsg as any).content).toContain("Execution succeeded.");
    expect((lastMsg as any).content).toContain("Do NOT include \"run_code\"");
  });

  it("includes error info for failed execution", () => {
    const result: CodeResult = {
      success: false,
      stdout: "",
      stderr: "Traceback...",
      error: "NameError: x is not defined",
      durationMs: 200,
    };
    const msgs = buildSecondPassMessages(baseMessages, runCode, result);

    const lastMsg = msgs[msgs.length - 1];
    expect((lastMsg as any).content).toContain("Execution failed.");
    expect((lastMsg as any).content).toContain("NameError");
  });

  it("does not mutate original messages array", () => {
    const original = [...baseMessages];
    const result: CodeResult = { success: true, stdout: "ok", stderr: "", durationMs: 100 };
    buildSecondPassMessages(baseMessages, runCode, result);

    expect(baseMessages).toEqual(original);
  });
});
