import type { ChatCompletionMessageParam, ChatCompletionTool } from "groq-sdk/resources/chat/completions";
import type { ResolvedActions } from "@quinn/shared";
import { emptyActions } from "@quinn/shared";
import type { RawCallResult, GroqUsage } from "./groqClient.js";
import type { CodeResult } from "../e2b/sandbox.js";
import { formatCodeResult } from "../e2b/sandbox.js";
import { buildToolRegistry, validateToolCall, type ValidatedToolCall } from "./tools.js";
import { stripImages } from "./buildMessages.js";

export const MAX_STEPS = 4;

/**
 * Tool-decision calls run cool: temperament heat (0.7+) corrupts tool-call
 * JSON on small models. Prose-only calls (split reply) keep temperament.
 */
export const TOOL_CALL_MAX_TEMPERATURE = 0.4;

export type LoopToolChoice =
  | "auto"
  | "required"
  | { type: "function"; function: { name: string } };

export interface AgentLoopDeps {
  callModel: (
    model: string,
    messages: ChatCompletionMessageParam[],
    tools: ChatCompletionTool[],
    toolChoice?: LoopToolChoice,
    maxTemperature?: number,
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

/**
 * Groq rejects a generation with 400 tool_use_failed when the model answers
 * in prose under tool_choice "required" — the prose lands in failed_generation.
 */
function extractFailedGeneration(err: unknown): string | undefined {
  const e = err as { error?: { error?: { code?: string; failed_generation?: string } } };
  const inner = e?.error?.error;
  if (inner?.code === "tool_use_failed" && typeof inner.failed_generation === "string" && inner.failed_generation.trim() !== "") {
    return inner.failed_generation;
  }
  return undefined;
}

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
  const offeredTools = new Set(tools.map((t) => t.function.name));

  const convo: ChatCompletionMessageParam[] = splitMode ? stripImages(messages) : [...messages];
  const actions = emptyActions();
  const usages: GroqUsage[] = [];
  const toolActivity: string[] = [];
  let replyRequested: { responseType: "reply" | "standalone" } | undefined;
  let e2bDurationMs: number | undefined;
  let e2bSuccess: boolean | undefined;
  let statusSent = false;
  let exhausted = true;
  let lastBatchProducedResults = false;

  for (let step = 0; step < MAX_STEPS; step++) {
    // After a result-producing batch the model must act on the results —
    // scout otherwise answers in bare prose, which we would have to discard.
    const toolChoice = lastBatchProducedResults ? "required" : "auto";
    let r: RawCallResult;
    try {
      r = await deps.callModel(opts.orchestratorModel, convo, tools, toolChoice, TOOL_CALL_MAX_TEMPERATURE);
    } catch (err) {
      const salvaged = extractFailedGeneration(err);
      if (salvaged && toolActivity.length > 0 && actions.reply === undefined) {
        console.warn(`[Quinn] agentLoop: tool_use_failed — salvaging prose answer as reply:\n${salvaged}`);
        actions.reply = {
          content: salvaged,
          thought: "(recovered: model answered in prose after tool results)",
          responseType: "reply",
        };
        exhausted = false;
        break;
      }
      throw err;
    }
    usages.push(r.usage);
    console.log(
      `[Quinn] agentLoop step ${step}: tools=[${r.toolCalls.map((tc) => tc.name).join(", ")}]` +
      (r.content ? ` text=${JSON.stringify(r.content.slice(0, 120))}` : "")
    );

    if (r.toolCalls.length === 0) {
      if (r.content && toolActivity.length > 0) {
        // Model answered in prose after gathering tool results: the answer
        // exists but not as a reply call. Fall through to the forced-reply
        // path (exhausted stays true) instead of eating the answer.
        console.warn(`[Quinn] agentLoop: prose answer after tool results (${r.content.length} chars) — forcing reply`);
      } else {
        if (r.content) {
          console.log(`[Quinn] agentLoop: discarded bare text (${r.content.length} chars)`);
          console.log(r);
        }
        exhausted = false;
      }
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

      if (!offeredTools.has(rawCall.name)) {
        console.warn(`[Quinn] agentLoop: tool '${rawCall.name}' was not offered in this request`);
        pushResult(`Error: tool '${rawCall.name}' is not available. Use one of the offered tools.`);
        continue;
      }

      const validated = validateToolCall(rawCall.name, rawCall.arguments);
      if (!validated.ok) {
        console.warn(`[Quinn] agentLoop: invalid ${rawCall.name} call: ${validated.error}`);
        pushResult(`Error: ${validated.error}. Fix the arguments and try again.`);
        continue;
      }
      const call = validated.call;
      console.log(`[Quinn] agentLoop step ${step}: ${call.name} args=${rawCall.arguments.slice(0, 400)}`);

      // Rule: reply may not land in the same batch as a result-producing tool.
      if (REPLY_TOOLS.has(call.name) && batchHasResultTool) {
        if (!statusSent && deps.onStatus) {
          deps.onStatus("*working on it…*");
          statusSent = true;
        }
        console.log(`[Quinn] agentLoop step ${step}: reply deferred (batched with a result tool)`);
        pushResult("Reply deferred: review the tool results first, then reply.");
        continue;
      }

      if (call.name === "run_code" && deps.executeCode) {
        const codeResult = await deps.executeCode(call.args.language, call.args.code);
        e2bDurationMs = (e2bDurationMs ?? 0) + codeResult.durationMs;
        e2bSuccess = codeResult.success && (e2bSuccess ?? true);
        console.log(
          `[Quinn] agentLoop: run_code ${call.args.language} ${codeResult.success ? "ok" : "FAILED"} (${codeResult.durationMs}ms)\n` +
          `--- code ---\n${call.args.code}\n` +
          `--- stdout ---\n${codeResult.stdout || "(empty)"}` +
          (codeResult.stderr ? `\n--- stderr ---\n${codeResult.stderr}` : "") +
          (codeResult.error ? `\n--- error ---\n${codeResult.error}` : "")
        );
        const formatted = formatCodeResult(call.args.language, call.args.code, codeResult);
        toolActivity.push(formatted);
        pushResult(formatted);
        batchProducedResults = true;
        continue;
      }

      if (call.name === "web_search" && deps.webSearch) {
        const searchResult = await deps.webSearch(call.args.query);
        console.log(
          `[Quinn] agentLoop: web_search "${call.args.query}" → ${searchResult.length} chars\n` +
          `--- result head ---\n${searchResult.slice(0, 400)}`
        );
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
    lastBatchProducedResults = batchProducedResults;
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

  console.log(
    `[Quinn] agentLoop done: calls=${usages.length}, reply=${actions.reply ? `${actions.reply.content.length} chars` : "none"}, ` +
    `react=${actions.react?.emoji ?? "no"}, memories+${actions.rememberUser.length + actions.rememberSelf.length}, ` +
    `forget=${actions.forget.length}, update=${actions.updateMemories.length}, timeout=${actions.timeout ? "YES" : "no"}`
  );
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
  }).filter((t) => t.function.name === "reply");

  const finalMessages: ChatCompletionMessageParam[] = [
    ...convo,
    { role: "user", content: "Wrap up now: call reply with your response. You may also react." },
  ];
  const model = splitMode ? opts.replyModel : opts.orchestratorModel;
  let r: RawCallResult;
  try {
    r = await deps.callModel(
      model, finalMessages, finalTools,
      { type: "function", function: { name: "reply" } },
      TOOL_CALL_MAX_TEMPERATURE,
    );
  } catch (err) {
    const salvaged = extractFailedGeneration(err);
    if (salvaged) {
      console.warn(`[Quinn] agentLoop: forced reply tool_use_failed — salvaging prose (${salvaged.length} chars)`);
      actions.reply = {
        content: salvaged,
        thought: "(recovered: model answered in prose on the forced reply)",
        responseType: "reply",
      };
      return;
    }
    throw err;
  }
  usages.push(r.usage);

  for (const rawCall of r.toolCalls) {
    const validated = validateToolCall(rawCall.name, rawCall.arguments);
    if (validated.ok && (validated.call.name === "reply" || validated.call.name === "react")) {
      applyActionTool(validated.call, actions);
    }
  }

  if (actions.reply === undefined) {
    console.error("[Quinn] agentLoop: forced reply call produced no valid reply — turn will be silent", {
      content: r.content,
      toolCalls: r.toolCalls.map((t) => t.name),
    });
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

  const r = await deps.callModel(
    opts.replyModel, replyMessages, replyTools,
    { type: "function", function: { name: "reply" } },
    // no temperature cap: this is the prose/personality call
  );
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
