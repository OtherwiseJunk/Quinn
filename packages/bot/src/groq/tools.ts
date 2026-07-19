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
  "Send a message to the channel. This is the ONLY way to say anything to users — plain text outside a tool call is discarded and never seen. Call it once you have everything you need to respond. Do not call it in the same turn as run_code or web_search — wait for their results first.",
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
      if (typeof args.reason !== "string" || args.reason.trim() === "") {
        return { ok: false, error: "timeout requires a non-empty string 'reason'" };
      }
      return { ok: true, call: { name: "timeout", args: { reason: args.reason } } };
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
