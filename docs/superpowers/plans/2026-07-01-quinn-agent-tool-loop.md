# Quinn Agent Tool Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Quinn's hand-rolled JSON response envelope with native Groq tool calling via a bounded agentic loop, with E2B code execution and web search as dispatched tools.

**Architecture:** A `runAgentLoop` orchestrates up to 4 Groq calls. The model expresses every action (reply, react, remember, forget, update_memory, timeout, run_code, web_search) as a native tool call. Action tools accumulate into a `ResolvedActions` struct; result-producing tools (run_code, web_search) execute and feed results back into the loop. Two env-configured model slots (orchestrator/reply) share one code path: when equal (default, scout) the flow is single-model; when different, the orchestrator sees a text-only view and a separate reply-model call generates prose with full image context.

**Tech Stack:** Bun workspaces, TypeScript, `groq-sdk`, `@e2b/code-interpreter`, `bun:test`, discord.js.

**Spec:** `docs/QuinnSkillsAndtools.md` (this plan covers spec Phases 1–3; behavior skills are a separate plan).

## Global Constraints

- Model IDs: default both slots to `meta-llama/llama-4-scout-17b-16e-instruct`; web search side-calls use `groq/compound-mini`.
- `MAX_STEPS = 4` loop cap.
- `thought` is a REQUIRED parameter of the `reply` tool.
- Bare assistant text with no tool calls is discarded (logged), never sent.
- A batch containing reply intent AND a result-producing tool drops the reply, executes the tool, continues.
- MAX_STEPS exhaustion with no reply → one final forced call restricted to reply/react.
- `timeout` without `reply` → forced reply call.
- Invalid tool args → error tool-result, model retries within step budget.
- Run all commands from repo root. Test: `cd packages/bot && bun test <file>`. Typecheck: `bun run typecheck`. Lint: `bun run lint`.
- Commit after every task. No AI attribution in commit messages.

## File Structure

| File | Responsibility |
|------|----------------|
| `packages/shared/src/types/groq.ts` | `ResolvedActions` (new), `GroqRequestContext` (kept), `QuinnResponse` (deleted in Task 8) |
| `packages/bot/src/groq/tools.ts` (new) | Tool definitions registry + per-tool arg validation |
| `packages/bot/src/groq/agentLoop.ts` (new) | The bounded loop; owns all loop rules; deps injected for testability |
| `packages/bot/src/groq/webSearch.ts` (new) | compound-mini side-call executor |
| `packages/bot/src/groq/groqClient.ts` | Thin `callGroqRaw` wrapper (SDK call + logging); old `callGroq` deleted in Task 8 |
| `packages/bot/src/groq/buildMessages.ts` | Slim system prompt; `stripImages`; `buildSecondPassMessages` deleted in Task 8 |
| `packages/bot/src/pipeline/messageProcessor.ts` | Consumes `ResolvedActions`; `handleCodeExecution` deleted |
| `packages/bot/src/pipeline/usageMeter.ts` | Per-model pricing table |
| `packages/bot/src/env.ts` | `GROQ_ORCHESTRATOR_MODEL`, `GROQ_REPLY_MODEL` |

---

### Task 1: Shared types + tool registry with validation

**Files:**
- Modify: `packages/shared/src/types/groq.ts`
- Create: `packages/bot/src/groq/tools.ts`
- Test: `packages/bot/src/groq/__tests__/tools.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ResolvedActions` (shared), `buildToolRegistry(opts: ToolRegistryOptions): ChatCompletionTool[]`, `validateToolCall(name: string, rawArgs: string): ValidationResult`, `ValidatedToolCall` union. Later tasks (agentLoop) rely on these exact names.

- [ ] **Step 1: Add `ResolvedActions` to shared types**

Append to `packages/shared/src/types/groq.ts` (leave `QuinnResponse` in place until Task 8):

```typescript
/** Actions accumulated from native tool calls during the agent loop. */
export interface ResolvedActions {
  reply?: { content: string; thought: string; responseType: "reply" | "standalone" };
  react?: { emoji: string };
  rememberUser: string[];
  rememberSelf: string[];
  forget: number[];
  updateMemories: { id: number; content: string }[];
  timeout?: { reason: string };
}

export function emptyActions(): ResolvedActions {
  return { rememberUser: [], rememberSelf: [], forget: [], updateMemories: [] };
}
```

Confirm `packages/shared/src/index.ts` re-exports `./types/groq.js` (it already exports the other groq types from there; add the export if the file uses named exports).

- [ ] **Step 2: Write the failing tests**

Create `packages/bot/src/groq/__tests__/tools.test.ts`:

```typescript
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd packages/bot && bun test src/groq/__tests__/tools.test.ts`
Expected: FAIL — `Cannot find module '../tools.js'`.

- [ ] **Step 4: Implement `tools.ts`**

Create `packages/bot/src/groq/tools.ts`:

```typescript
import type { ChatCompletionTool } from "groq-sdk/resources/chat/completions";

export interface ToolRegistryOptions {
  codeExecutionEnabled: boolean;
  webSearchEnabled: boolean;
  splitMode: boolean;
}

export type ValidatedToolCall =
  | { name: "reply"; args: { content: string; thought: string; response_type: "reply" | "standalone" } }
  | { name: "request_reply"; args: { response_type: "reply" | "standalone" } }
  | { name: "react"; args: { emoji: string } }
  | { name: "remember"; args: { scope: "user" | "self"; content: string[] } }
  | { name: "forget"; args: { ids: number[] } }
  | { name: "update_memory"; args: { id: number; content: string } }
  | { name: "timeout"; args: { reason: string } }
  | { name: "run_code"; args: { language: "python" | "javascript" | "bash"; code: string } }
  | { name: "web_search"; args: { query: string } };

export type ValidationResult =
  | { ok: true; call: ValidatedToolCall }
  | { ok: false; error: string };

function tool(name: string, description: string, properties: Record<string, unknown>, required: string[]): ChatCompletionTool {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters: { type: "object", properties, required },
    },
  };
}

const REPLY = tool(
  "reply",
  "Send a message to the channel. Call this ONLY when you have everything you need to respond. Do not call it in the same turn as run_code or web_search — wait for their results first.",
  {
    content: { type: "string", description: "The message to send" },
    thought: { type: "string", description: "Your internal reasoning (may be shown to users — keep it professional)" },
    response_type: { type: "string", enum: ["reply", "standalone"], description: "reply = threaded reply to the trigger message; standalone = plain channel message" },
  },
  ["content", "thought"],
);

const REQUEST_REPLY = tool(
  "request_reply",
  "Signal that you want to send a message to the channel. The message text is written afterwards with full context. Do not call in the same turn as run_code or web_search — wait for their results first.",
  {
    response_type: { type: "string", enum: ["reply", "standalone"], description: "reply = threaded reply to the trigger message; standalone = plain channel message" },
  },
  [],
);

const REACT = tool(
  "react",
  "Add an emoji reaction to the triggering message.",
  { emoji: { type: "string", description: "A single emoji" } },
  ["emoji"],
);

const REMEMBER = tool(
  "remember",
  "Save one or more memories. scope 'user' = observations about the triggering user; scope 'self' = your own opinions/preferences.",
  {
    scope: { type: "string", enum: ["user", "self"] },
    content: { type: "array", items: { type: "string" }, description: "Memory texts to save" },
  },
  ["scope", "content"],
);

const FORGET = tool(
  "forget",
  "Delete outdated or wrong memories by ID.",
  { ids: { type: "array", items: { type: "integer" }, description: "Memory IDs to delete" } },
  ["ids"],
);

const UPDATE_MEMORY = tool(
  "update_memory",
  "Correct the text of an existing memory.",
  {
    id: { type: "integer" },
    content: { type: "string", description: "Corrected memory text" },
  },
  ["id", "content"],
);

const TIMEOUT = tool(
  "timeout",
  "Request discipline for the triggering user (the server escalates: warning first, then timeouts). Use sparingly, for genuinely bad behavior. If you call this you must also reply.",
  { reason: { type: "string", description: "Why this user deserves discipline" } },
  ["reason"],
);

const RUN_CODE = tool(
  "run_code",
  "Execute code in a sandbox. Use ONLY for genuine computation, data processing, or complex logic you cannot do in your head. Never for simple arithmetic, string formatting, or restating known values — execution is expensive.",
  {
    language: { type: "string", enum: ["python", "javascript", "bash"] },
    code: { type: "string" },
  },
  ["language", "code"],
);

const WEB_SEARCH = tool(
  "web_search",
  "Search the web for current information you don't know. Results include citations.",
  { query: { type: "string", description: "What to search for" } },
  ["query"],
);

export function buildToolRegistry(opts: ToolRegistryOptions): ChatCompletionTool[] {
  const tools: ChatCompletionTool[] = [
    opts.splitMode ? REQUEST_REPLY : REPLY,
    REACT,
    REMEMBER,
    FORGET,
    UPDATE_MEMORY,
    TIMEOUT,
  ];
  if (opts.codeExecutionEnabled) tools.push(RUN_CODE);
  if (opts.webSearchEnabled) tools.push(WEB_SEARCH);
  return tools;
}

const VALID_LANGUAGES = new Set(["python", "javascript", "bash"]);

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function isNumberArray(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((x) => typeof x === "number");
}

function responseType(v: unknown): "reply" | "standalone" {
  return v === "standalone" ? "standalone" : "reply";
}

export function validateToolCall(name: string, rawArgs: string): ValidationResult {
  let args: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(rawArgs || "{}");
    if (typeof parsed !== "object" || parsed === null) {
      return { ok: false, error: "Arguments must be a JSON object" };
    }
    args = parsed as Record<string, unknown>;
  } catch {
    return { ok: false, error: "Arguments are not valid JSON" };
  }

  switch (name) {
    case "reply":
      if (typeof args.content !== "string" || args.content.trim() === "") {
        return { ok: false, error: "reply requires a non-empty string 'content'" };
      }
      if (typeof args.thought !== "string") {
        return { ok: false, error: "reply requires a string 'thought'" };
      }
      return { ok: true, call: { name: "reply", args: { content: args.content, thought: args.thought, response_type: responseType(args.response_type) } } };
    case "request_reply":
      return { ok: true, call: { name: "request_reply", args: { response_type: responseType(args.response_type) } } };
    case "react":
      if (typeof args.emoji !== "string" || args.emoji.trim() === "") {
        return { ok: false, error: "react requires a non-empty string 'emoji'" };
      }
      return { ok: true, call: { name: "react", args: { emoji: args.emoji } } };
    case "remember":
      if (args.scope !== "user" && args.scope !== "self") {
        return { ok: false, error: "remember requires scope 'user' or 'self'" };
      }
      if (!isStringArray(args.content) || args.content.length === 0) {
        return { ok: false, error: "remember requires a non-empty string array 'content'" };
      }
      return { ok: true, call: { name: "remember", args: { scope: args.scope, content: args.content } } };
    case "forget":
      if (!isNumberArray(args.ids) || args.ids.length === 0) {
        return { ok: false, error: "forget requires a non-empty number array 'ids'" };
      }
      return { ok: true, call: { name: "forget", args: { ids: args.ids } } };
    case "update_memory":
      if (typeof args.id !== "number" || typeof args.content !== "string" || args.content.trim() === "") {
        return { ok: false, error: "update_memory requires numeric 'id' and non-empty string 'content'" };
      }
      return { ok: true, call: { name: "update_memory", args: { id: args.id, content: args.content } } };
    case "timeout":
      return { ok: true, call: { name: "timeout", args: { reason: typeof args.reason === "string" ? args.reason : "" } } };
    case "run_code":
      if (typeof args.language !== "string" || !VALID_LANGUAGES.has(args.language)) {
        return { ok: false, error: "run_code requires language python, javascript, or bash" };
      }
      if (typeof args.code !== "string" || args.code.trim() === "") {
        return { ok: false, error: "run_code requires non-empty string 'code'" };
      }
      return { ok: true, call: { name: "run_code", args: { language: args.language as "python" | "javascript" | "bash", code: args.code } } };
    case "web_search":
      if (typeof args.query !== "string" || args.query.trim() === "") {
        return { ok: false, error: "web_search requires a non-empty string 'query'" };
      }
      return { ok: true, call: { name: "web_search", args: { query: args.query } } };
    default:
      return { ok: false, error: `Unknown tool '${name}'` };
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/bot && bun test src/groq/__tests__/tools.test.ts`
Expected: PASS (all).

- [ ] **Step 6: Typecheck and commit**

Run: `bun run typecheck` — expected clean.

```bash
git add packages/shared/src/types/groq.ts packages/shared/src/index.ts packages/bot/src/groq/tools.ts packages/bot/src/groq/__tests__/tools.test.ts
git commit -m "feat(bot): add tool registry and validation for agent loop"
```

---

### Task 2: Slim system prompt + text-only view helper

**Files:**
- Modify: `packages/bot/src/groq/buildMessages.ts`
- Test: `packages/bot/src/groq/__tests__/buildMessages.test.ts` (existing — update)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `stripImages(messages: ChatCompletionMessageParam[]): ChatCompletionMessageParam[]` (exported from buildMessages.ts). Slimmed `buildSystemMessage` (still private). `buildSecondPassMessages` stays until Task 8.

- [ ] **Step 1: Write failing tests**

Add to `packages/bot/src/groq/__tests__/buildMessages.test.ts` (keep existing tests; some system-prompt tests will need updating in Step 3):

```typescript
import { stripImages } from "../buildMessages.js";
import type { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions";

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
    const messages = buildMessages(context, [], makeMessage("hello"), "bot-id");
    const system = messages[0];
    expect(typeof system.content).toBe("string");
    expect(system.content as string).not.toContain("should_respond");
    expect(system.content as string).not.toContain("run_code");
    expect(system.content as string).toContain("You act by calling tools");
  });
});
```

(`makeMessage` — reuse the existing test helper in this file for fake discord Messages; match its actual name/shape when editing.)

- [ ] **Step 2: Run tests to verify new ones fail**

Run: `cd packages/bot && bun test src/groq/__tests__/buildMessages.test.ts`
Expected: FAIL — `stripImages` not exported; system message still contains schema.

- [ ] **Step 3: Implement**

In `packages/bot/src/groq/buildMessages.ts`, replace `buildSystemMessage` with:

```typescript
function buildSystemMessage(context: GroqRequestContext): ChatCompletionMessageParam {
  let content = context.systemPrompt;
  if (context.serverPrompt) {
    content += `\n\nAdditional instructions from the server admin:\n${context.serverPrompt}`;
  }
  content += `\n\nYou act by calling tools. Every action — replying, reacting, saving memories, running code — is a tool call. If you decide not to respond, simply call no reply tool. Never answer with plain text.`;
  return { role: "system", content };
}
```

Add `stripImages` (exported):

```typescript
/**
 * Text-only view for non-vision orchestrator models: image parts become
 * placeholders, array content flattens to a plain string.
 */
export function stripImages(messages: ChatCompletionMessageParam[]): ChatCompletionMessageParam[] {
  return messages.map((m) => {
    if (!Array.isArray(m.content)) return m;
    const parts = m.content as Array<{ type: string; text?: string }>;
    const rendered = parts.map((p) =>
      p.type === "text" ? (p.text ?? "") : "[user posted an image]"
    );
    return { ...m, content: rendered.join("\n") } as ChatCompletionMessageParam;
  });
}
```

Update any existing tests that asserted the schema block or the run_code guidance in the system prompt — they should now assert the slim form.

- [ ] **Step 4: Run full file tests**

Run: `cd packages/bot && bun test src/groq/__tests__/buildMessages.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/bot/src/groq/buildMessages.ts packages/bot/src/groq/__tests__/buildMessages.test.ts
git commit -m "feat(bot): slim system prompt and add text-only message view"
```

---

### Task 3: Model slots in env + raw Groq call wrapper

**Files:**
- Modify: `packages/bot/src/env.ts`
- Modify: `packages/bot/src/groq/groqClient.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: nothing new.
- Produces: `env.groqOrchestratorModel: string`, `env.groqReplyModel: string`, and:

```typescript
export interface RawCallResult {
  content: string | null;
  toolCalls: { id: string; name: string; arguments: string }[];
  usage: GroqUsage;
}
export async function callGroqRaw(
  model: string,
  messages: ChatCompletionMessageParam[],
  tools: ChatCompletionTool[],
  toolChoice?: "auto" | "required",
): Promise<RawCallResult>
```

`GroqUsage` gains `model: string`.

This is a thin I/O wrapper over the SDK (network call + logging); it gets no unit test — mocking the SDK to test a passthrough has no value. It is exercised by the agent-loop integration in Task 8's suite run and the Task 9 smoke test.

- [ ] **Step 1: Extend env**

In `packages/bot/src/env.ts` add to the `env` object:

```typescript
  groqOrchestratorModel:
    process.env.GROQ_ORCHESTRATOR_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct",
  groqReplyModel:
    process.env.GROQ_REPLY_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct",
```

Add to `.env.example`:

```
# Optional: model overrides for the agent loop (both default to llama-4-scout)
#GROQ_ORCHESTRATOR_MODEL=openai/gpt-oss-120b
#GROQ_REPLY_MODEL=meta-llama/llama-4-scout-17b-16e-instruct
```

- [ ] **Step 2: Add `callGroqRaw` to groqClient.ts**

Add `model: string` to `GroqUsage`. Add (keep the existing `callGroq`, `validateRunCode`, and `MODEL` untouched — deleted in Task 8):

```typescript
import type { ChatCompletionTool } from "groq-sdk/resources/chat/completions";
import { getTemperature } from "./temperament.js";

export interface RawCallResult {
  content: string | null;
  toolCalls: { id: string; name: string; arguments: string }[];
  usage: GroqUsage;
}

export async function callGroqRaw(
  model: string,
  messages: ChatCompletionMessageParam[],
  tools: ChatCompletionTool[],
  toolChoice: "auto" | "required" = "auto",
): Promise<RawCallResult> {
  const temperature = getTemperature();
  const start = Date.now();
  const completion = await groq.chat.completions.create({
    model,
    messages,
    tools,
    tool_choice: toolChoice,
    temperature,
    max_tokens: 1024,
  });
  const elapsed = Date.now() - start;
  const usage = completion.usage;
  const msg = completion.choices[0]?.message;

  console.log(
    `[Quinn] ${model} responded in ${elapsed}ms (${usage?.prompt_tokens ?? "?"}→${usage?.completion_tokens ?? "?"} tokens, ` +
    `${msg?.tool_calls?.length ?? 0} tool calls, temp=${temperature.toFixed(2)})`
  );

  return {
    content: msg?.content ?? null,
    toolCalls: (msg?.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments,
    })),
    usage: {
      model,
      promptTokens: usage?.prompt_tokens ?? 0,
      completionTokens: usage?.completion_tokens ?? 0,
    },
  };
}
```

Adding `model` to `GroqUsage` breaks the two places that construct usages — the existing `callGroq` (add `model: MODEL`) and `packages/bot/src/groq/consolidationClient.ts` if it builds a `GroqUsage` (add its model constant). Check with: `grep -rn "promptTokens" packages/bot/src`.

- [ ] **Step 3: Typecheck, run existing tests, commit**

Run: `bun run typecheck` — expected clean.
Run: `cd packages/bot && bun test` — expected: existing suite PASS (usageMeter tests may need `model` added to fixture objects; fix them).

```bash
git add packages/bot/src/env.ts packages/bot/src/groq/groqClient.ts .env.example packages/bot/src/pipeline/__tests__/usageMeter.test.ts
git commit -m "feat(bot): add model slots and raw tool-calling Groq wrapper"
```

---

### Task 4: Agent loop core — happy paths

**Files:**
- Create: `packages/bot/src/groq/agentLoop.ts`
- Test: `packages/bot/src/groq/__tests__/agentLoop.test.ts`

**Interfaces:**
- Consumes: `buildToolRegistry`, `validateToolCall`, `ValidatedToolCall` (Task 1); `stripImages` (Task 2); `RawCallResult`, `GroqUsage` (Task 3); `formatCodeResult`, `CodeResult` (existing sandbox.ts); `ResolvedActions`, `emptyActions` (Task 1).
- Produces:

```typescript
export interface AgentLoopDeps {
  callModel: (
    model: string,
    messages: ChatCompletionMessageParam[],
    tools: ChatCompletionTool[],
    toolChoice?: "auto" | "required",
  ) => Promise<RawCallResult>;
  executeCode?: (language: "python" | "javascript" | "bash", code: string) => Promise<CodeResult>;
  webSearch?: (query: string) => Promise<string>;
  onStatus?: (text: string) => void;
}
export interface AgentLoopOptions { orchestratorModel: string; replyModel: string; }
export interface AgentLoopResult {
  actions: ResolvedActions;
  usages: GroqUsage[];
  e2bDurationMs?: number;
  e2bSuccess?: boolean;
}
export async function runAgentLoop(
  messages: ChatCompletionMessageParam[],
  opts: AgentLoopOptions,
  deps: AgentLoopDeps,
): Promise<AgentLoopResult>
export const MAX_STEPS = 4;
```

- [ ] **Step 1: Write failing tests (happy paths)**

Create `packages/bot/src/groq/__tests__/agentLoop.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/bot && bun test src/groq/__tests__/agentLoop.test.ts`
Expected: FAIL — `Cannot find module '../agentLoop.js'`.

- [ ] **Step 3: Implement the core loop**

Create `packages/bot/src/groq/agentLoop.ts`:

```typescript
import type { ChatCompletionMessageParam, ChatCompletionTool } from "groq-sdk/resources/chat/completions";
import type { ResolvedActions } from "@quinn/shared";
import { emptyActions } from "@quinn/shared";
import type { RawCallResult, GroqUsage } from "./groqClient.js";
import type { CodeResult } from "../e2b/sandbox.js";
import { formatCodeResult } from "../e2b/sandbox.js";
import { buildToolRegistry, validateToolCall, type ValidatedToolCall } from "./tools.js";
import { stripImages } from "./buildMessages.js";

export const MAX_STEPS = 4;

export interface AgentLoopDeps {
  callModel: (
    model: string,
    messages: ChatCompletionMessageParam[],
    tools: ChatCompletionTool[],
    toolChoice?: "auto" | "required",
  ) => Promise<RawCallResult>;
  executeCode?: (language: "python" | "javascript" | "bash", code: string) => Promise<CodeResult>;
  webSearch?: (query: string) => Promise<string>;
  onStatus?: (text: string) => void;
}

export interface AgentLoopOptions {
  orchestratorModel: string;
  replyModel: string;
}

export interface AgentLoopResult {
  actions: ResolvedActions;
  usages: GroqUsage[];
  e2bDurationMs?: number;
  e2bSuccess?: boolean;
}

const RESULT_TOOLS = new Set(["run_code", "web_search"]);
const REPLY_TOOLS = new Set(["reply", "request_reply"]);

function applyActionTool(call: ValidatedToolCall, actions: ResolvedActions): string {
  switch (call.name) {
    case "reply":
      actions.reply = {
        content: call.args.content,
        thought: call.args.thought,
        responseType: call.args.response_type,
      };
      return "Reply recorded.";
    case "react":
      actions.react = { emoji: call.args.emoji };
      return "Reaction recorded.";
    case "remember":
      if (call.args.scope === "self") actions.rememberSelf.push(...call.args.content);
      else actions.rememberUser.push(...call.args.content);
      return "Memories saved.";
    case "forget":
      actions.forget.push(...call.args.ids);
      return "Memories deleted.";
    case "update_memory":
      actions.updateMemories.push({ id: call.args.id, content: call.args.content });
      return "Memory updated.";
    case "timeout":
      actions.timeout = { reason: call.args.reason };
      return "Discipline requested.";
    default:
      return "Recorded.";
  }
}

export async function runAgentLoop(
  messages: ChatCompletionMessageParam[],
  opts: AgentLoopOptions,
  deps: AgentLoopDeps,
): Promise<AgentLoopResult> {
  const splitMode = opts.orchestratorModel !== opts.replyModel;
  const tools = buildToolRegistry({
    codeExecutionEnabled: Boolean(deps.executeCode),
    webSearchEnabled: Boolean(deps.webSearch),
    splitMode,
  });

  const convo: ChatCompletionMessageParam[] = splitMode ? stripImages(messages) : [...messages];
  const actions = emptyActions();
  const usages: GroqUsage[] = [];
  const toolActivity: string[] = [];
  let replyRequested: { responseType: "reply" | "standalone" } | undefined;
  let e2bDurationMs: number | undefined;
  let e2bSuccess: boolean | undefined;
  let statusSent = false;
  let exhausted = true;

  for (let step = 0; step < MAX_STEPS; step++) {
    const r = await deps.callModel(opts.orchestratorModel, convo, tools, "auto");
    usages.push(r.usage);

    if (r.toolCalls.length === 0) {
      if (r.content) console.log(`[Quinn] agentLoop: discarded bare text (${r.content.length} chars)`);
      exhausted = false;
      break;
    }

    convo.push({
      role: "assistant",
      content: r.content ?? "",
      tool_calls: r.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: tc.arguments },
      })),
    });

    const batchHasResultTool = r.toolCalls.some((tc) => RESULT_TOOLS.has(tc.name));
    let batchProducedResults = false;

    for (const rawCall of r.toolCalls) {
      const pushResult = (content: string) =>
        convo.push({ role: "tool", tool_call_id: rawCall.id, content });

      const validated = validateToolCall(rawCall.name, rawCall.arguments);
      if (!validated.ok) {
        console.warn(`[Quinn] agentLoop: invalid ${rawCall.name} call: ${validated.error}`);
        pushResult(`Error: ${validated.error}. Fix the arguments and try again.`);
        continue;
      }
      const call = validated.call;

      // Rule: reply may not land in the same batch as a result-producing tool.
      if (REPLY_TOOLS.has(call.name) && batchHasResultTool) {
        if (!statusSent && deps.onStatus) {
          deps.onStatus("*working on it…*");
          statusSent = true;
        }
        pushResult("Reply deferred: review the tool results first, then reply.");
        continue;
      }

      if (call.name === "run_code" && deps.executeCode) {
        const codeResult = await deps.executeCode(call.args.language, call.args.code);
        e2bDurationMs = (e2bDurationMs ?? 0) + codeResult.durationMs;
        e2bSuccess = codeResult.success && (e2bSuccess ?? true);
        const formatted = formatCodeResult(call.args.language, call.args.code, codeResult);
        toolActivity.push(formatted);
        pushResult(formatted);
        batchProducedResults = true;
        continue;
      }

      if (call.name === "web_search" && deps.webSearch) {
        const searchResult = await deps.webSearch(call.args.query);
        const formatted = `Web search results for "${call.args.query}":\n${searchResult}`;
        toolActivity.push(formatted);
        pushResult(formatted);
        batchProducedResults = true;
        continue;
      }

      if (call.name === "request_reply") {
        replyRequested = { responseType: call.args.response_type };
        pushResult("Reply recorded.");
        continue;
      }

      pushResult(applyActionTool(call, actions));
    }

    const wantsReply = actions.reply !== undefined || replyRequested !== undefined;
    if (wantsReply && !batchProducedResults) {
      exhausted = false;
      break;
    }
  }

  // Rule: MAX_STEPS exhausted with no reply → one forced reply/react call.
  // Rule: timeout without reply → forced reply call.
  const needsForcedReply =
    (exhausted || actions.timeout !== undefined) &&
    actions.reply === undefined &&
    replyRequested === undefined;

  if (needsForcedReply && !(exhausted && actions.timeout === undefined && usages.length === 0)) {
    await forceReply(convo, opts, deps, actions, usages, splitMode);
  } else if (splitMode && replyRequested) {
    const generated = await generateSplitReply(messages, toolActivity, opts, deps, usages);
    if (generated) {
      actions.reply = { ...generated, responseType: replyRequested.responseType };
    }
  }

  return { actions, usages, e2bDurationMs, e2bSuccess };
}

/** Forced final call restricted to reply/react. Used on MAX_STEPS exhaustion and timeout-without-reply. */
async function forceReply(
  convo: ChatCompletionMessageParam[],
  opts: AgentLoopOptions,
  deps: AgentLoopDeps,
  actions: ResolvedActions,
  usages: GroqUsage[],
  splitMode: boolean,
): Promise<void> {
  const finalTools = buildToolRegistry({
    codeExecutionEnabled: false,
    webSearchEnabled: false,
    splitMode: false, // always the full reply tool: we need content now
  }).filter((t) => t.function.name === "reply" || t.function.name === "react");

  const finalMessages: ChatCompletionMessageParam[] = [
    ...convo,
    { role: "user", content: "Wrap up now: call reply with your response. You may also react." },
  ];
  const model = splitMode ? opts.replyModel : opts.orchestratorModel;
  const r = await deps.callModel(model, finalMessages, finalTools, "required");
  usages.push(r.usage);

  for (const rawCall of r.toolCalls) {
    const validated = validateToolCall(rawCall.name, rawCall.arguments);
    if (validated.ok && (validated.call.name === "reply" || validated.call.name === "react")) {
      applyActionTool(validated.call, actions);
    }
  }
}

/** Split mode: reply model sees the FULL multimodal messages plus tool activity, and must produce the reply. */
async function generateSplitReply(
  fullMessages: ChatCompletionMessageParam[],
  toolActivity: string[],
  opts: AgentLoopOptions,
  deps: AgentLoopDeps,
  usages: GroqUsage[],
): Promise<{ content: string; thought: string } | undefined> {
  const replyTools = buildToolRegistry({
    codeExecutionEnabled: false,
    webSearchEnabled: false,
    splitMode: false,
  }).filter((t) => t.function.name === "reply");

  const replyMessages: ChatCompletionMessageParam[] = [...fullMessages];
  if (toolActivity.length > 0) {
    replyMessages.push({
      role: "assistant",
      content: "I gathered some information before answering:",
    });
    replyMessages.push({
      role: "user",
      content: toolActivity.join("\n\n") + "\n\nUse the results above. Call reply with your response now.",
    });
  } else {
    replyMessages.push({ role: "user", content: "Call reply with your response now." });
  }

  const r = await deps.callModel(opts.replyModel, replyMessages, replyTools, "required");
  usages.push(r.usage);

  for (const rawCall of r.toolCalls) {
    const validated = validateToolCall(rawCall.name, rawCall.arguments);
    if (validated.ok && validated.call.name === "reply") {
      return { content: validated.call.args.content, thought: validated.call.args.thought };
    }
  }
  console.warn("[Quinn] agentLoop: split reply model produced no valid reply");
  return undefined;
}
```

Note on the `needsForcedReply` guard: a natural silent break (`exhausted === false`, no timeout) must NOT force a reply — silence is legitimate. The condition triggers only when the step budget ran out, or a timeout was requested without a reply. (The extra `usages.length === 0` clause never fires in practice — it guards a zero-call edge if MAX_STEPS were ever 0.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/bot && bun test src/groq/__tests__/agentLoop.test.ts`
Expected: PASS. (The forced-reply/exhaustion paths are exercised in Task 5's tests; happy paths must not trigger them — the "silent" tests double as regression guards for that.)

- [ ] **Step 5: Typecheck and commit**

Run: `bun run typecheck` — expected clean.

```bash
git add packages/bot/src/groq/agentLoop.ts packages/bot/src/groq/__tests__/agentLoop.test.ts
git commit -m "feat(bot): add bounded agent loop core"
```

---

### Task 5: Agent loop edge rules

**Files:**
- Modify: `packages/bot/src/groq/agentLoop.ts` (only if tests expose gaps — the Task 4 implementation already encodes the rules)
- Test: `packages/bot/src/groq/__tests__/agentLoop.test.ts` (extend)

**Interfaces:**
- Consumes: everything from Task 4 (same test helpers — `scriptedModel`, `tc`, `usage`, `BASE`, `OPTS`).
- Produces: no new exports; verified loop rules.

- [ ] **Step 1: Write the edge-rule tests**

Append to `agentLoop.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests**

Run: `cd packages/bot && bun test src/groq/__tests__/agentLoop.test.ts`
Expected: mostly PASS from Task 4's implementation. Failures localize real gaps — fix `agentLoop.ts` until green. Known subtlety: the timeout-without-reply test breaks the loop via empty tool_calls (`exhausted = false`), so `needsForcedReply` must still trigger off `actions.timeout` — the Task 4 condition `(exhausted || actions.timeout !== undefined)` covers it.

- [ ] **Step 3: Commit**

```bash
git add packages/bot/src/groq/agentLoop.ts packages/bot/src/groq/__tests__/agentLoop.test.ts
git commit -m "test(bot): cover agent loop edge rules"
```

---

### Task 6: Agent loop split mode

**Files:**
- Modify: `packages/bot/src/groq/agentLoop.ts` (fix gaps the tests expose)
- Test: `packages/bot/src/groq/__tests__/agentLoop.test.ts` (extend)

**Interfaces:**
- Consumes: Task 4/5 helpers.
- Produces: verified split-mode behavior; no new exports.

- [ ] **Step 1: Write split-mode tests**

Append to `agentLoop.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests, fix gaps**

Run: `cd packages/bot && bun test src/groq/__tests__/agentLoop.test.ts`
Expected: Task 4's implementation covers these; any failure is a real bug — fix in `agentLoop.ts`. Watch the `request_reply` + later forced-reply interplay: `generateSplitReply` must use `replyRequested.responseType`, not the reply tool's own `response_type` (the test asserts `standalone`).

- [ ] **Step 3: Commit**

```bash
git add packages/bot/src/groq/agentLoop.ts packages/bot/src/groq/__tests__/agentLoop.test.ts
git commit -m "test(bot): cover agent loop split mode"
```

---

### Task 7: web_search executor + per-model pricing

**Files:**
- Create: `packages/bot/src/groq/webSearch.ts`
- Modify: `packages/bot/src/pipeline/usageMeter.ts`
- Test: `packages/bot/src/pipeline/__tests__/usageMeter.test.ts` (extend), `packages/bot/src/groq/__tests__/webSearch.test.ts` (new, pure-function part only)

**Interfaces:**
- Consumes: `GroqUsage` (with `model`) from Task 3.
- Produces:

```typescript
// webSearch.ts
export function isWebSearchEnabled(): boolean;           // true — no extra key needed
export async function webSearch(query: string): Promise<{ text: string; usage: GroqUsage }>;
export function formatSearchResult(content: string | null): string; // pure, tested
// usageMeter.ts — estimateCost signature gains searchCount
export function estimateCost(groqUsages: GroqUsage[], e2bDurationMs?: number, searchCount?: number): number;
```

- [ ] **Step 1: Write failing tests**

Update `packages/bot/src/pipeline/__tests__/usageMeter.test.ts` — existing fixtures gain `model: "meta-llama/llama-4-scout-17b-16e-instruct"`. Add:

```typescript
it("prices gpt-oss-120b tokens at its own rate", () => {
  const scout = estimateCost([{ model: "meta-llama/llama-4-scout-17b-16e-instruct", promptTokens: 1_000_000, completionTokens: 0 }]);
  const oss = estimateCost([{ model: "openai/gpt-oss-120b", promptTokens: 1_000_000, completionTokens: 0 }]);
  expect(oss).toBeGreaterThan(scout); // $0.15 vs $0.11 input
});

it("prices unknown models at the scout rate", () => {
  const known = estimateCost([{ model: "meta-llama/llama-4-scout-17b-16e-instruct", promptTokens: 500, completionTokens: 100 }]);
  const unknown = estimateCost([{ model: "who/knows", promptTokens: 500, completionTokens: 100 }]);
  expect(unknown).toBe(known);
});

it("adds a flat fee per web search", () => {
  const withoutSearch = estimateCost([], undefined, 0);
  const withSearch = estimateCost([], undefined, 2);
  expect(withoutSearch).toBe(0);
  expect(withSearch).toBeGreaterThan(0);
});
```

Create `packages/bot/src/groq/__tests__/webSearch.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import { formatSearchResult } from "../webSearch.js";

describe("formatSearchResult", () => {
  it("returns content as-is", () => {
    expect(formatSearchResult("Bun 1.3 shipped in June.")).toBe("Bun 1.3 shipped in June.");
  });
  it("handles null content", () => {
    expect(formatSearchResult(null)).toBe("(no results)");
  });
  it("truncates very long results", () => {
    const long = "x".repeat(10_000);
    expect(formatSearchResult(long).length).toBeLessThanOrEqual(6_100);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/bot && bun test src/groq/__tests__/webSearch.test.ts src/pipeline/__tests__/usageMeter.test.ts`
Expected: FAIL — module missing; estimateCost has no rate table / searchCount param.

- [ ] **Step 3: Implement**

Create `packages/bot/src/groq/webSearch.ts`:

```typescript
import Groq from "groq-sdk";
import { env } from "../env.js";
import type { GroqUsage } from "./groqClient.js";

const groq = new Groq({ apiKey: env.groqApiKey });

const SEARCH_MODEL = "groq/compound-mini";
const MAX_RESULT_CHARS = 6_000;

export function isWebSearchEnabled(): boolean {
  return true; // same Groq API key; no extra secret needed
}

export function formatSearchResult(content: string | null): string {
  if (!content) return "(no results)";
  if (content.length <= MAX_RESULT_CHARS) return content;
  return content.slice(0, MAX_RESULT_CHARS) + "\n...(truncated)";
}

export async function webSearch(query: string): Promise<{ text: string; usage: GroqUsage }> {
  const start = Date.now();
  const completion = await groq.chat.completions.create({
    model: SEARCH_MODEL,
    messages: [
      {
        role: "user",
        content: `Search the web and answer concisely with source URLs: ${query}`,
      },
    ],
    // Restrict compound to web search only (no code exec / browser).
    // The SDK does not type compound_custom yet; cast is deliberate.
    ...({ compound_custom: { tools: { enabled_tools: ["web_search"] } } } as object),
  });
  console.log(`[Quinn] web_search "${query}" in ${Date.now() - start}ms`);

  const usage = completion.usage;
  return {
    text: formatSearchResult(completion.choices[0]?.message?.content ?? null),
    usage: {
      model: SEARCH_MODEL,
      promptTokens: usage?.prompt_tokens ?? 0,
      completionTokens: usage?.completion_tokens ?? 0,
    },
  };
}
```

Rewrite `packages/bot/src/pipeline/usageMeter.ts`:

```typescript
import type { GroqUsage } from "../groq/groqClient.js";

// Groq per-token pricing. compound-mini rates are ESTIMATES (pricing is
// "passed through to underlying models") — verify against the first real
// invoices during Phase 3 rollout.
const RATES: Record<string, { input: number; output: number }> = {
  "meta-llama/llama-4-scout-17b-16e-instruct": { input: 0.11 / 1e6, output: 0.34 / 1e6 },
  "openai/gpt-oss-120b": { input: 0.15 / 1e6, output: 0.6 / 1e6 },
  "groq/compound-mini": { input: 0.59 / 1e6, output: 0.79 / 1e6 },
};
const DEFAULT_RATE = RATES["meta-llama/llama-4-scout-17b-16e-instruct"];

// Groq built-in search: $5–8 per 1k requests; assume the upper tier.
const WEB_SEARCH_FLAT = 0.008;

// E2B pricing: default sandbox (2vCPU + 2GB)
const E2B_RATE_PER_MS = 0.000118 / 1000;

// Business multipliers
export const PROFIT_MARGIN = 1.15;
export const PLATFORM_FEE_MULTIPLIER = 1 / 0.70; // Discord standard 30% cut

export function estimateCost(
  groqUsages: GroqUsage[],
  e2bDurationMs?: number,
  searchCount?: number,
): number {
  let rawCost = 0;

  for (const usage of groqUsages) {
    const rate = RATES[usage.model] ?? DEFAULT_RATE;
    rawCost += usage.promptTokens * rate.input;
    rawCost += usage.completionTokens * rate.output;
  }

  if (e2bDurationMs !== undefined && e2bDurationMs > 0) {
    rawCost += e2bDurationMs * E2B_RATE_PER_MS;
  }

  if (searchCount !== undefined && searchCount > 0) {
    rawCost += searchCount * WEB_SEARCH_FLAT;
  }

  return rawCost * PROFIT_MARGIN * PLATFORM_FEE_MULTIPLIER;
}
```

- [ ] **Step 4: Run tests**

Run: `cd packages/bot && bun test src/groq/__tests__/webSearch.test.ts src/pipeline/__tests__/usageMeter.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `bun run typecheck` — expected clean.

```bash
git add packages/bot/src/groq/webSearch.ts packages/bot/src/groq/__tests__/webSearch.test.ts packages/bot/src/pipeline/usageMeter.ts packages/bot/src/pipeline/__tests__/usageMeter.test.ts
git commit -m "feat(bot): add web_search executor and per-model pricing"
```

---

### Task 8: messageProcessor cutover + delete the envelope

**Files:**
- Modify: `packages/bot/src/pipeline/messageProcessor.ts`
- Modify: `packages/bot/src/groq/groqClient.ts` (delete `callGroq`, `validateRunCode`, `MODEL`, `GroqCallResult`)
- Modify: `packages/bot/src/groq/buildMessages.ts` (delete `buildSecondPassMessages`)
- Modify: `packages/shared/src/types/groq.ts` (delete `QuinnResponse`)
- Test: `packages/bot/src/groq/__tests__/groqClient.test.ts`, `packages/bot/src/groq/__tests__/buildMessages.test.ts` (update/remove obsolete cases)

**Interfaces:**
- Consumes: `runAgentLoop`, `AgentLoopResult` (Task 4); `callGroqRaw` (Task 3); `webSearch`, `isWebSearchEnabled` (Task 7); `executeCode`, `isCodeExecutionEnabled` (existing); `ResolvedActions` (Task 1).
- Produces: nothing new — this is the wiring + deletion task. `processMessage` signature unchanged.

- [ ] **Step 1: Rewire `processMessage`**

In `messageProcessor.ts`, replace the callGroq + handleCodeExecution block (the section from `const groqUsages: GroqUsage[] = []` through the `codeExec` lines) with:

```typescript
    // Web-search side calls carry their own usage; collect them outside the loop.
    let searchCount = 0;
    const sideUsages: GroqUsage[] = [];
    const webSearchDep = isWebSearchEnabled()
      ? async (q: string) => {
          const r = await webSearch(q);
          searchCount++;
          sideUsages.push(r.usage);
          return r.text;
        }
      : undefined;

    const stopTyping = startTyping(message.channel);
    let loopResult: AgentLoopResult;
    try {
      loopResult = await runAgentLoop(
        groqMessages,
        { orchestratorModel: env.groqOrchestratorModel, replyModel: env.groqReplyModel },
        {
          callModel: callGroqRaw,
          executeCode: isCodeExecutionEnabled() ? executeCode : undefined,
          webSearch: webSearchDep,
          onStatus: (text) => { sendChannel(channel, text).catch(() => {}); },
        },
      );
    } finally {
      stopTyping();
    }
    const { actions } = loopResult;
    const groqUsages: GroqUsage[] = [...loopResult.usages, ...sideUsages];
```

Downstream rewiring (same function, in order):

```typescript
    // Pronouns: thought lives on the reply now
    const pronounSet = resolveUserPronounSet(context.userContext, message.member ?? null);
    if (actions.reply && pronounSet !== null && pronounSet !== PronounSet.They) {
      actions.reply.thought = replacePronouns(actions.reply.thought, pronounSet, PronounSet.They);
    }

    reportApiUsage(groqUsages, guildId, channelId, message.author.id, label,
      loopResult.e2bDurationMs, loopResult.e2bSuccess, searchCount);

    if (actions.react) {
      console.log(`[Quinn] ${label}: reacting with ${actions.react.emoji}`);
      await message.react(actions.react.emoji).catch(() => {});
    }

    persistMemories(actions, guildId, message.author.id, label);
    await handleDiscipline(actions, guildId, message.author.id, label);
    await sendResponse(actions, config, message, channel, label);
```

Update the helpers to take `ResolvedActions`:

- `persistMemories(actions: ResolvedActions, ...)` — read `actions.rememberUser`, `actions.rememberSelf`, `actions.forget`, `actions.updateMemories` (same serverClient calls: `saveMemories(guildId, userId, actions.rememberUser)`, `saveMemories(guildId, null, actions.rememberSelf)`, `deleteMemoriesById(guildId, actions.forget)`, `updateMemoriesById(guildId, actions.updateMemories)`; keep the length-guard + logging pattern).
- `handleDiscipline(actions: ResolvedActions, ...)` — `if (!actions.timeout) return;` then append the warning/timeout text to `actions.reply!.content` (the loop guarantees a reply exists whenever timeout is set — rely on it, but guard with `if (!actions.reply) return;` and a `console.error` since a model contract is not a type guarantee).
- `sendResponse(actions: ResolvedActions, ...)` — `if (!actions.reply) { log silent; return; }`; forbidden-word check on `actions.reply.content`; typing delay on content length; `if (config.displayThoughts && actions.reply.thought)` post the thought block; send by `actions.reply.responseType`.
- `reportApiUsage(...)` gains `searchCount?: number`, passes it to `estimateCost(groqUsages, e2bDurationMs, searchCount)`.
- Delete `handleCodeExecution` entirely.
- Update imports: drop `callGroq`, `buildSecondPassMessages`, `QuinnResponse`; add `runAgentLoop`, `AgentLoopResult`, `callGroqRaw`, `webSearch`, `isWebSearchEnabled`, `ResolvedActions`.

- [ ] **Step 2: Delete dead code**

- `groqClient.ts`: delete `callGroq`, `GroqCallResult`, `validateRunCode`, `VALID_LANGUAGES`, `MODEL`. Keep `GroqUsage`, `RawCallResult`, `callGroqRaw`, the `groq` client instance.
- `buildMessages.ts`: delete `buildSecondPassMessages` and its `CodeResult`/`formatCodeResult`/`QuinnResponse` imports.
- `packages/shared/src/types/groq.ts`: delete `QuinnResponse`.
- `groqClient.test.ts`: delete tests for `callGroq` JSON parsing / `validateRunCode`; the file may shrink to nothing — if so delete it.
- `buildMessages.test.ts`: delete `buildSecondPassMessages` tests.

- [ ] **Step 3: Full verification**

Run: `bun run typecheck` — expected clean (any remaining `QuinnResponse` reference will surface here).
Run: `cd packages/bot && bun test` — expected: full suite PASS.
Run: `bun run lint` — expected clean.

- [ ] **Step 4: Commit**

```bash
git add -A packages/bot packages/shared
git commit -m "feat(bot)!: replace JSON envelope with native tool-calling agent loop

Model actions (reply, react, memories, timeout, run_code, web_search)
are now native Groq tool calls resolved by a bounded loop instead of
fields on a JSON envelope. Deletes callGroq, buildSecondPassMessages,
and QuinnResponse."
```

---

### Task 9: Live smoke test

**Files:** none (verification only).

**Interfaces:** consumes the running bot (`docker-compose.yml` / `bun run dev` per package).

- [ ] **Step 1: Start the stack**

Follow the repo's normal dev flow (postgres + server + bot; `docker-compose up` covers the db). Requires real `DISCORD_TOKEN`, `GROQ_API_KEY`, and `E2B_API_KEY` in `.env`. Leave both model slots unset (scout single-model).

- [ ] **Step 2: Verify in a test Discord channel**

1. Mention Quinn with a plain question → expect a normal reply; logs show `tool calls` count ≥ 1 and `reply` recorded.
2. Post an image + mention → expect a reply that references the image (scout tools+images smoke test — a spec requirement).
3. Ask something compute-heavy ("what's the 40th Fibonacci number times 9?") → logs show `run_code` executed, then a reply citing the result.
4. Ask something current-events ("what shipped in the latest Bun release?") → logs show `web_search`, reply includes sourced info.
5. Say something Quinn should ignore in a respondToAll=off channel → silence, log shows either no tool calls or discarded bare text.
6. Check the usage dashboard/DB rows: `groqCalls` reflects loop call counts (>1 for the code/search turns).

- [ ] **Step 3: Record results**

Note any tool-adherence misfires (bare text, wrong args) in `docs/QuinnSkillsAndtools.md` under a new "Observed misfire notes" line — these calibrate whether the Phase 5 gpt-oss orchestrator flip is urgent.

---

## Explicitly Out of Scope (separate plans)

- Behavior skills / caveman mode (spec Phase 4): server storage, `/skill` command, prompt fragments.
- Orchestrator flip to gpt-oss-120b (spec Phase 5): manual testing + config change, gated on this plan shipping.
- `reasoning_effort` plumbing for gpt-oss (only needed at Phase 5).
