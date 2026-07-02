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
