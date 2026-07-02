import { describe, it, expect, mock, beforeEach } from "bun:test";

const createMock = mock();

mock.module("groq-sdk", () => ({
  default: class {
    chat = {
      completions: {
        create: createMock,
      },
    };
  },
}));

mock.module("../env.js", () => ({
  env: { groqApiKey: "test-key" },
}));

mock.module("./temperament.js", () => ({
  getTemperature: () => 0.7,
}));

const { callGroq } = await import("../groqClient.js");

beforeEach(() => {
  createMock.mockReset();
});

function mockGroqResponse(json: Record<string, unknown>) {
  createMock.mockResolvedValueOnce({
    choices: [{ message: { content: JSON.stringify(json) } }],
    usage: { prompt_tokens: 10, completion_tokens: 20 },
  });
}

describe("callGroq", () => {
  it("throws on empty Groq response", async () => {
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: null } }],
      usage: null,
    });
    await expect(callGroq([])).rejects.toThrow("Empty response from Groq");
  });

  it("throws when should_respond is missing", async () => {
    mockGroqResponse({ content: "hi" });
    await expect(callGroq([])).rejects.toThrow("missing should_respond");
  });

  it("returns { response, usage } shape", async () => {
    mockGroqResponse({ should_respond: true });
    const result = await callGroq([]);
    expect(result).toHaveProperty("response");
    expect(result).toHaveProperty("usage");
    expect(result.usage).toEqual({ model: "meta-llama/llama-4-scout-17b-16e-instruct", promptTokens: 10, completionTokens: 20 });
  });

  it("defaults usage to 0 when Groq returns no usage", async () => {
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ should_respond: true }) } }],
      usage: null,
    });
    const result = await callGroq([]);
    expect(result.usage).toEqual({ model: "meta-llama/llama-4-scout-17b-16e-instruct", promptTokens: 0, completionTokens: 0 });
  });

  it("defaults thought_process to empty string", async () => {
    mockGroqResponse({ should_respond: true });
    const { response } = await callGroq([]);
    expect(response.thought_process).toBe("");
  });

  it("defaults response_type to 'reply'", async () => {
    mockGroqResponse({ should_respond: true });
    const { response } = await callGroq([]);
    expect(response.response_type).toBe("reply");
  });

  it("defaults content to empty string", async () => {
    mockGroqResponse({ should_respond: false });
    const { response } = await callGroq([]);
    expect(response.content).toBe("");
  });

  it("defaults should_react to false", async () => {
    mockGroqResponse({ should_respond: true });
    const { response } = await callGroq([]);
    expect(response.should_react).toBe(false);
  });

  it("passes through new_memories when array", async () => {
    mockGroqResponse({
      should_respond: true,
      new_memories: ["Likes cats", "Hates rain"],
    });
    const { response } = await callGroq([]);
    expect(response.new_memories).toEqual(["Likes cats", "Hates rain"]);
  });

  it("drops new_memories when not an array", async () => {
    mockGroqResponse({
      should_respond: true,
      new_memories: "not an array",
    });
    const { response } = await callGroq([]);
    expect(response.new_memories).toBeUndefined();
  });

  it("passes through delete_memories when array of numbers", async () => {
    mockGroqResponse({
      should_respond: true,
      delete_memories: [1, 2, 3],
    });
    const { response } = await callGroq([]);
    expect(response.delete_memories).toEqual([1, 2, 3]);
  });

  it("drops delete_memories when not an array of numbers", async () => {
    mockGroqResponse({
      should_respond: true,
      delete_memories: ["a", "b"],
    });
    const { response } = await callGroq([]);
    expect(response.delete_memories).toBeUndefined();
  });

  it("drops delete_memories when not an array", async () => {
    mockGroqResponse({
      should_respond: true,
      delete_memories: "not an array",
    });
    const { response } = await callGroq([]);
    expect(response.delete_memories).toBeUndefined();
  });

  it("passes through update_memories when valid", async () => {
    mockGroqResponse({
      should_respond: true,
      update_memories: [{ id: 42, content: "updated text" }],
    });
    const { response } = await callGroq([]);
    expect(response.update_memories).toEqual([{ id: 42, content: "updated text" }]);
  });

  it("drops update_memories when malformed", async () => {
    mockGroqResponse({
      should_respond: true,
      update_memories: [{ id: "not a number", content: "text" }],
    });
    const { response } = await callGroq([]);
    expect(response.update_memories).toBeUndefined();
  });

  it("drops update_memories when not an array", async () => {
    mockGroqResponse({
      should_respond: true,
      update_memories: "not an array",
    });
    const { response } = await callGroq([]);
    expect(response.update_memories).toBeUndefined();
  });

  it("converts truthy timeout_user to true", async () => {
    mockGroqResponse({
      should_respond: true,
      timeout_user: "yes",
    });
    const { response } = await callGroq([]);
    expect(response.timeout_user).toBe(true);
  });

  it("drops falsy timeout_user", async () => {
    mockGroqResponse({
      should_respond: true,
      timeout_user: false,
    });
    const { response } = await callGroq([]);
    expect(response.timeout_user).toBeUndefined();
  });

  it("passes through valid run_code", async () => {
    mockGroqResponse({
      should_respond: true,
      run_code: { language: "python", code: "print(42)" },
    });
    const { response } = await callGroq([]);
    expect(response.run_code).toEqual({ language: "python", code: "print(42)" });
  });

  it("accepts all valid run_code languages", async () => {
    for (const lang of ["python", "javascript", "bash"] as const) {
      mockGroqResponse({
        should_respond: true,
        run_code: { language: lang, code: "x" },
      });
      const { response } = await callGroq([]);
      expect(response.run_code?.language).toBe(lang);
    }
  });

  it("drops run_code with invalid language", async () => {
    mockGroqResponse({
      should_respond: true,
      run_code: { language: "ruby", code: "puts 42" },
    });
    const { response } = await callGroq([]);
    expect(response.run_code).toBeUndefined();
  });

  it("drops run_code with empty code", async () => {
    mockGroqResponse({
      should_respond: true,
      run_code: { language: "python", code: "   " },
    });
    const { response } = await callGroq([]);
    expect(response.run_code).toBeUndefined();
  });

  it("drops run_code when not an object", async () => {
    mockGroqResponse({
      should_respond: true,
      run_code: "not an object",
    });
    const { response } = await callGroq([]);
    expect(response.run_code).toBeUndefined();
  });

  it("drops run_code when null", async () => {
    mockGroqResponse({
      should_respond: true,
      run_code: null,
    });
    const { response } = await callGroq([]);
    expect(response.run_code).toBeUndefined();
  });
});
