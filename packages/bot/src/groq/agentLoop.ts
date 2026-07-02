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
