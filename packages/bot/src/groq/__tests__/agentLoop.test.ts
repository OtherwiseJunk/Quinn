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
