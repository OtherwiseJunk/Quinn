import type { ForbiddenUser } from "@quinn/shared";
import { pool } from "./pool.js";
import { rowToForbiddenUser } from "./mapDbRow.js";
import { Cache } from "../lib/cache.js";

// Cache the full list per guild. isForbidden derives its answer from this,
// so one invalidation covers all user checks for that guild.
const cache = new Cache<ForbiddenUser[]>(5 * 60 * 1000); // 5 min

async function loadForbiddenUsers(guildId: string): Promise<ForbiddenUser[]> {
  const cached = cache.get(guildId);
  if (cached) return cached;

  const result = await pool.query(
    "SELECT * FROM forbidden_users WHERE guild_id = $1 ORDER BY added_at DESC",
    [guildId]
  );
  const users = result.rows.map(rowToForbiddenUser);
  cache.set(guildId, users);
  return users;
}

export async function listForbiddenUsers(guildId: string): Promise<ForbiddenUser[]> {
  return loadForbiddenUsers(guildId);
}

export async function isForbidden(
  discordUserId: string,
  guildId: string
): Promise<boolean> {
  const users = await loadForbiddenUsers(guildId);
  return users.some((u) => u.discordUserId === discordUserId);
}

export async function addForbiddenUser(
  discordUserId: string,
  guildId: string
): Promise<ForbiddenUser> {
  const result = await pool.query(
    `INSERT INTO forbidden_users (discord_user_id, guild_id)
     VALUES ($1, $2)
     ON CONFLICT (discord_user_id, guild_id) DO UPDATE SET added_at = NOW()
     RETURNING *`,
    [discordUserId, guildId]
  );
  cache.delete(guildId);
  return rowToForbiddenUser(result.rows[0]);
}

export async function removeForbiddenUser(
  discordUserId: string,
  guildId: string
): Promise<void> {
  await pool.query(
    "DELETE FROM forbidden_users WHERE discord_user_id = $1 AND guild_id = $2",
    [discordUserId, guildId]
  );
  cache.delete(guildId);
}
