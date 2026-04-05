import type { UserContext } from "@quinn/shared";
import { pool } from "./pool.js";
import { rowToUserContext } from "./mapDbRow.js";
import { Cache } from "../lib/cache.js";

const cache = new Cache<UserContext | null>(2 * 60 * 1000); // 2 min — changes via slash commands

export async function getUserContext(discordUserId: string): Promise<UserContext | null> {
  const cached = cache.get(discordUserId);
  if (cached !== undefined) return cached;

  const result = await pool.query(
    "SELECT * FROM user_context WHERE discord_user_id = $1",
    [discordUserId]
  );
  const context = result.rows[0] ? rowToUserContext(result.rows[0]) : null;
  cache.set(discordUserId, context);
  return context;
}

export async function upsertUserContext(
  discordUserId: string,
  context: string
): Promise<UserContext> {
  const result = await pool.query(
    `INSERT INTO user_context (discord_user_id, context, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (discord_user_id) DO UPDATE SET context = EXCLUDED.context, updated_at = NOW()
     RETURNING *`,
    [discordUserId, context]
  );
  const updated = rowToUserContext(result.rows[0]);
  cache.set(discordUserId, updated);
  return updated;
}

export async function deleteUserContext(discordUserId: string): Promise<void> {
  await pool.query("DELETE FROM user_context WHERE discord_user_id = $1", [
    discordUserId,
  ]);
  cache.delete(discordUserId);
}
