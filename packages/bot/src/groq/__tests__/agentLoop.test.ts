import { describe, it, expect } from "bun:test";
import { runAgentLoop, type AgentLoopDeps } from "../agentLoop.js";
import type { RawCallResult } from "../groqClient.js";
import type { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions";

const OPTS = { orchestratorModel: "scout", replyModel: "scout" };
const BASE: ChatCompletionMessageParam[] = [
  { role: "system", content: "You are Quinn." },
  { role: "user", content: "alice: hi quinn" },
];

let callId = 0;
function tc(name: string, args: object): RawCallResult["toolCalls"][number] {
  return { id: `call_${callId++}`, name, arguments: JSON.stringify(args) };
}
function usage(): RawCallResult["usage"] {
  return { model: "scout", promptTokens: 100, completionTokens: 20 };
}

/** Queue of scripted model turns; records every request it receives. */
function scriptedModel(turns: Partial<RawCallResult>[]) {
  const requests: { model: string; messages: ChatCompletionMessageParam[]; toolNames: string[]; toolChoice?: string }[] = [];
  let i = 0;
  const callModel: AgentLoopDeps["callModel"] = async (model, messages, tools, toolChoice) => {
    requests.push({ model, messages, toolNames: tools.map((t) => t.function.name), toolChoice });
    const turn = turns[Math.min(i, turns.length - 1)];
    i++;
    return { content: null, toolCalls: [], usage: usage(), ...turn };
  };
  return { callModel, requests };
}

describe("runAgentLoop — happy paths", () => {
  it("collects a reply and stops", async () => {
    const m = scriptedModel([
      { toolCalls: [tc("reply", { content: "hey alice", thought: "greeting back", response_type: "reply" })] },
    ]);
    const result = await runAgentLoop(BASE, OPTS, { callModel: m.callModel });
    expect(result.actions.reply).toEqual({ content: "hey alice", thought: "greeting back", responseType: "reply" });
    expect(m.requests.length).toBe(1);
    expect(result.usages.length).toBe(1);
  });

  it("is silent when the model makes no tool calls", async () => {
    const m = scriptedModel([{ content: null, toolCalls: [] }]);
    const result = await runAgentLoop(BASE, OPTS, { callModel: m.callModel });
    expect(result.actions.reply).toBeUndefined();
    expect(m.requests.length).toBe(1);
  });

  it("discards bare text content (no tool calls) and stays silent", async () => {
    const m = scriptedModel([{ content: "hey alice!", toolCalls: [] }]);
    const result = await runAgentLoop(BASE, OPTS, { callModel: m.callModel });
    expect(result.actions.reply).toBeUndefined();
  });

  it("accumulates action tools alongside a reply in one batch", async () => {
    const m = scriptedModel([
      {
        toolCalls: [
          tc("remember", { scope: "user", content: ["alice likes jazz"] }),
          tc("remember", { scope: "self", content: ["I enjoy music talk"] }),
          tc("forget", { ids: [3] }),
          tc("update_memory", { id: 7, content: "alice plays bass" }),
          tc("react", { emoji: "🎷" }),
          tc("reply", { content: "nice", thought: "jazz chat", response_type: "reply" }),
        ],
      },
    ]);
    const { actions } = await runAgentLoop(BASE, OPTS, { callModel: m.callModel });
    expect(actions.rememberUser).toEqual(["alice likes jazz"]);
    expect(actions.rememberSelf).toEqual(["I enjoy music talk"]);
    expect(actions.forget).toEqual([3]);
    expect(actions.updateMemories).toEqual([{ id: 7, content: "alice plays bass" }]);
    expect(actions.react).toEqual({ emoji: "🎷" });
    expect(actions.reply?.content).toBe("nice");
  });

  it("memory-only turn stays silent but keeps the memories", async () => {
    const m = scriptedModel([
      { toolCalls: [tc("remember", { scope: "user", content: ["bob is away this week"] })] },
      { toolCalls: [] },
    ]);
    const { actions } = await runAgentLoop(BASE, OPTS, { callModel: m.callModel });
    expect(actions.reply).toBeUndefined();
    expect(actions.rememberUser).toEqual(["bob is away this week"]);
  });

  it("omits run_code and web_search from the registry when deps are absent", async () => {
    const m = scriptedModel([{ toolCalls: [] }]);
    await runAgentLoop(BASE, OPTS, { callModel: m.callModel });
    expect(m.requests[0].toolNames).not.toContain("run_code");
    expect(m.requests[0].toolNames).not.toContain("web_search");
    expect(m.requests[0].toolNames).toContain("reply");
  });
});

function fakeCodeResult(overrides: Partial<import("../../e2b/sandbox.js").CodeResult> = {}) {
  return { success: true, stdout: "42", stderr: "", durationMs: 500, ...overrides };
}

describe("runAgentLoop — tool execution", () => {
  it("executes run_code, feeds the result back, and returns e2b metrics", async () => {
    const m = scriptedModel([
      { toolCalls: [tc("run_code", { language: "python", code: "print(6*7)" })] },
      { toolCalls: [tc("reply", { content: "it's 42", thought: "computed", response_type: "reply" })] },
    ]);
    const executed: string[] = [];
    const result = await runAgentLoop(BASE, OPTS, {
      callModel: m.callModel,
      executeCode: async (lang, code) => { executed.push(`${lang}:${code}`); return fakeCodeResult(); },
    });
    expect(executed).toEqual(["python:print(6*7)"]);
    expect(result.actions.reply?.content).toBe("it's 42");
    expect(result.e2bDurationMs).toBe(500);
    expect(result.e2bSuccess).toBe(true);
    // second request must contain the tool result
    const second = m.requests[1];
    const toolMsg = second.messages.find((msg) => msg.role === "tool");
    expect(toolMsg?.content as string).toContain("42");
  });

  it("executes web_search via the injected dep", async () => {
    const m = scriptedModel([
      { toolCalls: [tc("web_search", { query: "bun 1.3 release date" })] },
      { toolCalls: [tc("reply", { content: "answer", thought: "searched", response_type: "reply" })] },
    ]);
    const queries: string[] = [];
    await runAgentLoop(BASE, OPTS, {
      callModel: m.callModel,
      webSearch: async (q) => { queries.push(q); return "Bun 1.3 shipped in ..."; },
    });
    expect(queries).toEqual(["bun 1.3 release date"]);
  });
});

describe("runAgentLoop — edge rules", () => {
  it("drops a reply batched with run_code and sends a status message", async () => {
    const m = scriptedModel([
      {
        toolCalls: [
          tc("run_code", { language: "python", code: "print(1)" }),
          tc("reply", { content: "premature", thought: "guessing", response_type: "reply" }),
        ],
      },
      { toolCalls: [tc("reply", { content: "informed", thought: "saw results", response_type: "reply" })] },
    ]);
    const statuses: string[] = [];
    const { actions } = await runAgentLoop(BASE, OPTS, {
      callModel: m.callModel,
      executeCode: async () => fakeCodeResult(),
      onStatus: (t) => statuses.push(t),
    });
    expect(actions.reply?.content).toBe("informed");
    expect(statuses.length).toBe(1);
  });

  it("feeds validation errors back and lets the model retry", async () => {
    const m = scriptedModel([
      { toolCalls: [tc("run_code", { language: "cobol", code: "x" })] },
      { toolCalls: [tc("reply", { content: "recovered", thought: "fixed args", response_type: "reply" })] },
    ]);
    const { actions } = await runAgentLoop(BASE, OPTS, {
      callModel: m.callModel,
      executeCode: async () => fakeCodeResult(),
    });
    expect(actions.reply?.content).toBe("recovered");
    const second = m.requests[1];
    const toolMsg = second.messages.find((msg) => msg.role === "tool");
    expect(toolMsg?.content as string).toContain("Error");
  });

  it("forces a final reply/react-only call when MAX_STEPS is exhausted", async () => {
    const m = scriptedModel([
      // 4 turns of endless searching, then the forced call answers
      { toolCalls: [tc("web_search", { query: "a" })] },
      { toolCalls: [tc("web_search", { query: "b" })] },
      { toolCalls: [tc("web_search", { query: "c" })] },
      { toolCalls: [tc("web_search", { query: "d" })] },
      { toolCalls: [tc("reply", { content: "final answer", thought: "wrapped up", response_type: "reply" })] },
    ]);
    const { actions, usages } = await runAgentLoop(BASE, OPTS, {
      callModel: m.callModel,
      webSearch: async () => "result",
    });
    expect(actions.reply?.content).toBe("final answer");
    expect(usages.length).toBe(5); // 4 loop calls + 1 forced
    const forced = m.requests[4];
    expect(forced.toolChoice).toBe("required");
    expect(forced.toolNames.toSorted()).toEqual(["react", "reply"]);
  });

  it("forces a reply when timeout is requested without one", async () => {
    const m = scriptedModel([
      { toolCalls: [tc("timeout", { reason: "spamming slurs" })] },
      { toolCalls: [] }, // model goes quiet
      { toolCalls: [tc("reply", { content: "enough.", thought: "discipline", response_type: "reply" })] },
    ]);
    const { actions } = await runAgentLoop(BASE, OPTS, { callModel: m.callModel });
    expect(actions.timeout).toEqual({ reason: "spamming slurs" });
    expect(actions.reply?.content).toBe("enough.");
  });

  it("does NOT force a reply on a legitimate silent break", async () => {
    const m = scriptedModel([{ toolCalls: [] }]);
    const { actions, usages } = await runAgentLoop(BASE, OPTS, { callModel: m.callModel });
    expect(actions.reply).toBeUndefined();
    expect(usages.length).toBe(1); // no forced extra call
  });
});

const SPLIT_OPTS = { orchestratorModel: "gpt-oss", replyModel: "scout" };
const IMAGE_MESSAGES: ChatCompletionMessageParam[] = [
  { role: "system", content: "You are Quinn." },
  {
    role: "user",
    content: [
      { type: "text", text: "alice: look at my dog" },
      { type: "image_url", image_url: { url: "https://cdn.example/dog.png" } },
    ],
  },
];

describe("runAgentLoop — split mode", () => {
  it("orchestrator gets text-only view; reply model gets full images", async () => {
    const m = scriptedModel([
      { toolCalls: [tc("request_reply", { response_type: "reply" })] },
      { toolCalls: [tc("reply", { content: "cute dog!", thought: "nice corgi", response_type: "reply" })] },
    ]);
    const { actions } = await runAgentLoop(IMAGE_MESSAGES, SPLIT_OPTS, { callModel: m.callModel });

    // turn 1: orchestrator, stripped view, request_reply variant
    expect(m.requests[0].model).toBe("gpt-oss");
    expect(m.requests[0].messages[1].content).toBe("alice: look at my dog\n[user posted an image]");
    expect(m.requests[0].toolNames).toContain("request_reply");
    expect(m.requests[0].toolNames).not.toContain("reply");

    // turn 2: reply model, full multimodal view, forced reply
    expect(m.requests[1].model).toBe("scout");
    expect(Array.isArray(m.requests[1].messages[1].content)).toBe(true);
    expect(m.requests[1].toolChoice).toBe("required");
    expect(m.requests[1].toolNames).toEqual(["reply"]);

    expect(actions.reply).toEqual({ content: "cute dog!", thought: "nice corgi", responseType: "reply" });
  });

  it("passes tool activity to the reply model", async () => {
    const m = scriptedModel([
      { toolCalls: [tc("run_code", { language: "python", code: "print(2**10)" })] },
      { toolCalls: [tc("request_reply", { response_type: "standalone" })] },
      { toolCalls: [tc("reply", { content: "1024", thought: "ran it", response_type: "reply" })] },
    ]);
    const { actions } = await runAgentLoop(BASE, SPLIT_OPTS, {
      callModel: m.callModel,
      executeCode: async () => fakeCodeResult({ stdout: "1024" }),
    });
    const replyCall = m.requests[2];
    const activityMsg = replyCall.messages.find(
      (msg) => msg.role === "user" && typeof msg.content === "string" && msg.content.includes("1024"),
    );
    expect(activityMsg).toBeDefined();
    // request_reply's response_type wins over the reply tool's default
    expect(actions.reply?.responseType).toBe("standalone");
  });

  it("silent split turns never invoke the reply model", async () => {
    const m = scriptedModel([{ toolCalls: [] }]);
    const { usages } = await runAgentLoop(BASE, SPLIT_OPTS, { callModel: m.callModel });
    expect(usages.length).toBe(1);
    expect(m.requests.every((r) => r.model === "gpt-oss")).toBe(true);
  });

  it("equal model slots collapse to single-model flow (no stripping, direct reply tool)", async () => {
    const m = scriptedModel([
      { toolCalls: [tc("reply", { content: "hi", thought: "t", response_type: "reply" })] },
    ]);
    await runAgentLoop(IMAGE_MESSAGES, OPTS, { callModel: m.callModel });
    expect(Array.isArray(m.requests[0].messages[1].content)).toBe(true); // images intact
    expect(m.requests[0].toolNames).toContain("reply");
  });
});
