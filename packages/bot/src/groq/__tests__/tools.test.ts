import { describe, it, expect } from "bun:test";
import { buildToolRegistry, validateToolCall } from "../tools.js";

const allOn = { codeExecutionEnabled: true, webSearchEnabled: true, splitMode: false };

describe("buildToolRegistry", () => {
  it("includes all tools when everything is enabled (single mode)", () => {
    const names = buildToolRegistry(allOn).map((t) => t.function.name);
    expect(names).toEqual([
      "reply", "react", "remember", "forget",
      "update_memory", "timeout", "run_code", "web_search",
    ]);
  });

  it("omits run_code when code execution is disabled", () => {
    const names = buildToolRegistry({ ...allOn, codeExecutionEnabled: false }).map((t) => t.function.name);
    expect(names).not.toContain("run_code");
  });

  it("omits web_search when web search is disabled", () => {
    const names = buildToolRegistry({ ...allOn, webSearchEnabled: false }).map((t) => t.function.name);
    expect(names).not.toContain("web_search");
  });

  it("uses request_reply instead of reply in split mode", () => {
    const names = buildToolRegistry({ ...allOn, splitMode: true }).map((t) => t.function.name);
    expect(names).toContain("request_reply");
    expect(names).not.toContain("reply");
  });

  it("marks thought as required on reply", () => {
    const reply = buildToolRegistry(allOn).find((t) => t.function.name === "reply")!;
    const params = reply.function.parameters as { required: string[] };
    expect(params.required).toContain("thought");
    expect(params.required).toContain("content");
  });
});

describe("validateToolCall", () => {
  it("accepts a valid reply", () => {
    const r = validateToolCall("reply", JSON.stringify({
      content: "hi", thought: "greeting", response_type: "reply",
    }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.call).toEqual({
      name: "reply",
      args: { content: "hi", thought: "greeting", response_type: "reply" },
    });
  });

  it("rejects reply missing thought", () => {
    const r = validateToolCall("reply", JSON.stringify({ content: "hi", response_type: "reply" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("thought");
  });

  it("rejects unparseable JSON args", () => {
    const r = validateToolCall("reply", "{not json");
    expect(r.ok).toBe(false);
  });

  it("rejects unknown tool names", () => {
    const r = validateToolCall("summon_demon", "{}");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Unknown tool");
  });

  it("rejects run_code with invalid language", () => {
    const r = validateToolCall("run_code", JSON.stringify({ language: "cobol", code: "x" }));
    expect(r.ok).toBe(false);
  });

  it("rejects run_code with empty code", () => {
    const r = validateToolCall("run_code", JSON.stringify({ language: "python", code: "  " }));
    expect(r.ok).toBe(false);
  });

  it("accepts remember with scope self", () => {
    const r = validateToolCall("remember", JSON.stringify({ scope: "self", content: ["likes jazz"] }));
    expect(r.ok).toBe(true);
  });

  it("rejects remember with non-string array content", () => {
    const r = validateToolCall("remember", JSON.stringify({ scope: "user", content: [42] }));
    expect(r.ok).toBe(false);
  });

  it("rejects forget with non-numeric ids", () => {
    const r = validateToolCall("forget", JSON.stringify({ ids: ["7"] }));
    expect(r.ok).toBe(false);
  });

  it("accepts request_reply with response_type", () => {
    const r = validateToolCall("request_reply", JSON.stringify({ response_type: "standalone" }));
    expect(r.ok).toBe(true);
  });

  it("defaults response_type to reply when omitted", () => {
    const r = validateToolCall("reply", JSON.stringify({ content: "hi", thought: "t" }));
    expect(r.ok).toBe(true);
    if (r.ok && r.call.name === "reply") expect(r.call.args.response_type).toBe("reply");
  });
});
