import { pool } from "./pool.js";
import { Cache } from "../lib/cache.js";

const cache = new Cache<string>(5 * 60 * 1000); // 5 min
const KEY = "system-prompt";
const FORBIDDEN_KEY = "global-forbidden-words";
const LIMIT_KEY = "context-message-limit";
const wordsCache = new Cache<string[]>(5 * 60 * 1000);
const limitCache = new Cache<number>(5 * 60 * 1000);

export async function getSystemPrompt(): Promise<string> {
  const cached = cache.get(KEY);
  if (cached !== undefined) return cached;

  const result = await pool.query(
    "SELECT prompt FROM system_prompt ORDER BY id DESC LIMIT 1"
  );
  const prompt = result.rows[0].prompt as string;
  cache.set(KEY, prompt);
  return prompt;
}

export async function setSystemPrompt(prompt: string): Promise<void> {
  await pool.query(
    "UPDATE system_prompt SET prompt = $1, updated_at = NOW() WHERE id = (SELECT id FROM system_prompt ORDER BY id DESC LIMIT 1)",
    [prompt]
  );
  cache.delete(KEY);
}

export async function getGlobalForbiddenWords(): Promise<string[]> {
  const cached = wordsCache.get(FORBIDDEN_KEY);
  if (cached !== undefined) return cached;

  const result = await pool.query(
    "SELECT global_forbidden_words FROM system_prompt ORDER BY id DESC LIMIT 1"
  );
  const words = (result.rows[0].global_forbidden_words as string[]) ?? [];
  wordsCache.set(FORBIDDEN_KEY, words);
  return words;
}

export async function setGlobalForbiddenWords(words: string[]): Promise<void> {
  await pool.query(
    "UPDATE system_prompt SET global_forbidden_words = $1, updated_at = NOW() WHERE id = (SELECT id FROM system_prompt ORDER BY id DESC LIMIT 1)",
    [words]
  );
  wordsCache.delete(FORBIDDEN_KEY);
}

export async function getContextMessageLimit(): Promise<number> {
  const cached = limitCache.get(LIMIT_KEY);
  if (cached !== undefined) return cached;

  const result = await pool.query(
    "SELECT context_message_limit FROM system_prompt ORDER BY id DESC LIMIT 1"
  );
  const limit = (result.rows[0].context_message_limit as number) ?? 25;
  limitCache.set(LIMIT_KEY, limit);
  return limit;
}

export async function setContextMessageLimit(limit: number): Promise<void> {
  await pool.query(
    "UPDATE system_prompt SET context_message_limit = $1, updated_at = NOW() WHERE id = (SELECT id FROM system_prompt ORDER BY id DESC LIMIT 1)",
    [limit]
  );
  limitCache.delete(LIMIT_KEY);
}
