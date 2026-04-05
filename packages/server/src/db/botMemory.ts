import type { BotMemory } from "@quinn/shared";
import { pool } from "./pool.js";
import { rowToBotMemory } from "./mapDbRow.js";
import { Cache } from "../lib/cache.js";

const cache = new Cache<BotMemory[]>(2 * 60 * 1000); // 2 min

function cacheKey(guildId: string, userId: string | null): string {
  return `${guildId}:${userId ?? "__self__"}`;
}

/** Get memories for a specific user in a guild, or Quinn's own memories (userId=null) */
export async function getMemories(
  guildId: string,
  userId: string | null
): Promise<BotMemory[]> {
  const key = cacheKey(guildId, userId);
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const result = userId
    ? await pool.query(
        "SELECT * FROM bot_memory WHERE guild_id = $1 AND subject_user_id = $2 ORDER BY created_at",
        [guildId, userId]
      )
    : await pool.query(
        "SELECT * FROM bot_memory WHERE guild_id = $1 AND subject_user_id IS NULL ORDER BY created_at",
        [guildId]
      );

  const memories = result.rows.map(rowToBotMemory);
  cache.set(key, memories);
  return memories;
}

/** Normalize a memory string for duplicate comparison */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
}

/** Check if two normalized strings are near-duplicates */
function isDuplicate(a: string, b: string): boolean {
  if (a === b) return true;
  // One contains the other (catches "Likes cats" vs "They like cats a lot")
  if (a.length > 5 && b.length > 5) {
    if (a.includes(b) || b.includes(a)) return true;
  }
  return false;
}

/** Bulk insert new memories, skipping near-duplicates of existing ones */
export async function addMemories(
  guildId: string,
  subjectUserId: string | null,
  contents: string[]
): Promise<void> {
  if (contents.length === 0) return;

  // Load existing memories to check for duplicates
  const existing = await getMemories(guildId, subjectUserId);
  const existingNormalized = existing.map((m) => normalize(m.content));

  // Filter out duplicates
  const novel: string[] = [];
  for (const content of contents) {
    const norm = normalize(content);
    if (norm.length === 0) continue;
    const isDupe = existingNormalized.some((e) => isDuplicate(norm, e));
    if (!isDupe) {
      novel.push(content);
      // Also check against other new memories being added in this batch
      existingNormalized.push(norm);
    }
  }

  if (novel.length === 0) {
    console.log(
      `[Quinn] Skipped ${contents.length} duplicate memory/memories for ${subjectUserId ?? "self"}`
    );
    return;
  }
  if (novel.length < contents.length) {
    console.log(
      `[Quinn] Filtered ${contents.length - novel.length} duplicate(s), saving ${novel.length} new memory/memories`
    );
  }

  // Build bulk insert
  const values: unknown[] = [];
  const placeholders: string[] = [];
  for (let i = 0; i < novel.length; i++) {
    const offset = i * 3;
    placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3})`);
    values.push(guildId, subjectUserId, novel[i]);
  }

  await pool.query(
    `INSERT INTO bot_memory (guild_id, subject_user_id, content) VALUES ${placeholders.join(", ")}`,
    values
  );

  cache.delete(cacheKey(guildId, subjectUserId));
}

/** Delete memories by IDs */
export async function deleteMemories(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  await pool.query(
    "DELETE FROM bot_memory WHERE id = ANY($1::int[])",
    [ids]
  );
  // Clear entire cache since we don't know which guild/user combos were affected
  cache.clear();
}

/** Update a single memory's content by ID */
export async function updateMemory(id: number, content: string): Promise<void> {
  await pool.query(
    "UPDATE bot_memory SET content = $2, updated_at = NOW() WHERE id = $1",
    [id, content]
  );
  cache.clear();
}

/** Get distinct subject users with memory counts for a guild */
export async function getMemoryUsers(
  guildId: string
): Promise<{ userId: string; count: number }[]> {
  const result = await pool.query(
    `SELECT subject_user_id, COUNT(*)::int AS count
     FROM bot_memory
     WHERE guild_id = $1 AND subject_user_id IS NOT NULL
     GROUP BY subject_user_id
     ORDER BY count DESC`,
    [guildId]
  );
  return result.rows.map((r) => ({
    userId: r.subject_user_id as string,
    count: r.count as number,
  }));
}

/** Count memories for a specific user (or self if null) in a guild */
export async function countMemories(
  guildId: string,
  userId: string | null
): Promise<number> {
  const result = userId
    ? await pool.query(
        "SELECT COUNT(*)::int AS count FROM bot_memory WHERE guild_id = $1 AND subject_user_id = $2",
        [guildId, userId]
      )
    : await pool.query(
        "SELECT COUNT(*)::int AS count FROM bot_memory WHERE guild_id = $1 AND subject_user_id IS NULL",
        [guildId]
      );
  return result.rows[0].count as number;
}

/** Get groups of memories that exceed the provided limit for consolidation */
export async function getPendingConsolidation(
  guildId: string, maxCount: number
): Promise<{ subjectUserId: string | null; memories: BotMemory[] }[]> {
  // Find groups with more than maxCount memories
  const groups = await pool.query(
    `SELECT subject_user_id, COUNT(*)::int AS count
     FROM bot_memory WHERE guild_id = $1
     GROUP BY subject_user_id HAVING COUNT(*) > ${maxCount}`,
    [guildId]
  );

  const result = await Promise.all(
    groups.rows.map(async (group) => {
      const userId = group.subject_user_id as string | null;
      const memoriesResult = userId
        ? await pool.query(
            "SELECT * FROM bot_memory WHERE guild_id = $1 AND subject_user_id = $2 ORDER BY created_at",
            [guildId, userId]
          )
        : await pool.query(
            "SELECT * FROM bot_memory WHERE guild_id = $1 AND subject_user_id IS NULL ORDER BY created_at",
            [guildId]
          );

      return {
        subjectUserId: userId,
        memories: memoriesResult.rows.map(rowToBotMemory),
      };
    })
  );

  return result;
}
