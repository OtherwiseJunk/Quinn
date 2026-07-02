import Groq from "groq-sdk";
import type { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions";
import type { ChatCompletionTool } from "groq-sdk/resources/chat/completions";
import type { QuinnResponse } from "@quinn/shared";
import { env } from "../env.js";
import { getTemperature } from "./temperament.js";

export interface GroqUsage {
  model: string;
  promptTokens: number;
  completionTokens: number;
}

export interface RawCallResult {
  content: string | null;
  toolCalls: { id: string; name: string; arguments: string }[];
  usage: GroqUsage;
}

export interface GroqCallResult {
  response: QuinnResponse;
  usage: GroqUsage;
}

const VALID_LANGUAGES = new Set(["python", "javascript", "bash"]);

function validateRunCode(
  value: unknown
): QuinnResponse["run_code"] | undefined {
  if (!value || typeof value !== "object") return undefined;
  const obj = value as Record<string, unknown>;
  if (
    typeof obj.language !== "string" ||
    !VALID_LANGUAGES.has(obj.language) ||
    typeof obj.code !== "string" ||
    obj.code.trim() === ""
  ) {
    return undefined;
  }
  return { language: obj.language as "python" | "javascript" | "bash", code: obj.code };
}

const groq = new Groq({ apiKey: env.groqApiKey });

const MODEL = "Openai/gpt-oss-120b";

export async function callGroq(
  messages: ChatCompletionMessageParam[]
): Promise<GroqCallResult> {
  const temperature = getTemperature();

  // Log the full request payload for debugging (truncate long text content)
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (typeof msg.content === "string") {
      const preview = msg.content.length > 200 ? msg.content.slice(0, 200) + "..." : msg.content;
      console.log(`[Quinn] msg[${i}] role=${msg.role} content=${JSON.stringify(preview)}`);
    } else if (Array.isArray(msg.content)) {
      const parts = (msg.content as Array<{ type: string; text?: string; image_url?: { url: string } }>).map((p) => {
        if (p.type === "text") return `text(${p.text!.length} chars)`;
        if (p.type === "image_url") return `image_url(${p.image_url!.url.slice(0, 80)}...)`;
        return `unknown(${p.type})`;
      });
      console.log(`[Quinn] msg[${i}] role=${msg.role} content=[${parts.join(", ")}]`);
    }
  }

  const start = Date.now();
  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages,
    response_format: { type: "json_object" },
    temperature,
    max_tokens: 1024,
  });
  const elapsed = Date.now() - start;

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("Empty response from Groq");
  }

  const usage = completion.usage;
  console.log(
    `[Quinn] Groq response in ${elapsed}ms (${usage?.prompt_tokens ?? "?"}→${usage?.completion_tokens ?? "?"} tokens, temp=${temperature.toFixed(2)})`
  );

  const parsed = JSON.parse(raw) as QuinnResponse;

  if (typeof parsed.should_respond !== "boolean") {
    throw new Error("Invalid Groq response: missing should_respond");
  }

  console.log(`[Quinn] Parsed Groq response:`, parsed);

  return {
    response: {
      thought_process: parsed.thought_process ?? "",
      should_respond: parsed.should_respond,
      response_type: parsed.response_type ?? "reply",
      content: parsed.content ?? "",
      should_react: parsed.should_react ?? false,
      reaction_emoji: parsed.reaction_emoji ?? "",
      new_memories: Array.isArray(parsed.new_memories) ? parsed.new_memories : undefined,
      new_self_memories: Array.isArray(parsed.new_self_memories) ? parsed.new_self_memories : undefined,
      delete_memories: Array.isArray(parsed.delete_memories) && parsed.delete_memories.every((v: unknown) => typeof v === "number")
        ? parsed.delete_memories : undefined,
      update_memories: Array.isArray(parsed.update_memories) && parsed.update_memories.every((v: unknown) => typeof v === "object" && v !== null && typeof (v as any).id === "number" && typeof (v as any).content === "string")
        ? parsed.update_memories : undefined,
      timeout_user: parsed.timeout_user ? true : undefined,
      run_code: validateRunCode(parsed.run_code),
    },
    usage: {
      model: MODEL,
      promptTokens: usage?.prompt_tokens ?? 0,
      completionTokens: usage?.completion_tokens ?? 0,
    },
  };
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
