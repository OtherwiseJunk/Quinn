import Groq from "groq-sdk";
import type { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions";
import { env } from "../env.js";

export interface ConsolidationUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface ConsolidationResult {
  content: string;
  usage: ConsolidationUsage;
}

const groq = new Groq({ apiKey: env.groqApiKey });

const MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

export async function callConsolidation(
  messages: ChatCompletionMessageParam[],
): Promise<ConsolidationResult> {
  const start = Date.now();
  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages,
    response_format: { type: "json_object" },
    temperature: 0.3,
    max_tokens: 4096,
  });
  const elapsed = Date.now() - start;

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("Empty response from Groq (consolidation)");
  }

  const usage = completion.usage;
  console.log(
    `[Consolidation] Groq response in ${elapsed}ms (${usage?.prompt_tokens ?? "?"}→${usage?.completion_tokens ?? "?"} tokens)`
  );

  return {
    content: raw,
    usage: {
      promptTokens: usage?.prompt_tokens ?? 0,
      completionTokens: usage?.completion_tokens ?? 0,
    },
  };
}
