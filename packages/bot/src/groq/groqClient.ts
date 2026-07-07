import Groq from "groq-sdk";
import type { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions";
import type { ChatCompletionTool } from "groq-sdk/resources/chat/completions";
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

/** "auto" | "required" | force one specific function by name. */
export type ToolChoice =
  | "auto"
  | "required"
  | { type: "function"; function: { name: string } };

const groq = new Groq({ apiKey: env.groqApiKey });

export async function callGroqRaw(
  model: string,
  messages: ChatCompletionMessageParam[],
  tools: ChatCompletionTool[],
  toolChoice: ToolChoice = "auto",
  maxTemperature?: number,
): Promise<RawCallResult> {
  const temperature = maxTemperature !== undefined
    ? Math.min(getTemperature(), maxTemperature)
    : getTemperature();
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
