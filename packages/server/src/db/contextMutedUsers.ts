import { pool } from "./pool.js";
import { Cache } from "../lib/cache.js";

const cache = new Cache<boolean>(5 * 60 * 1000); // 5 min

function cacheKey(discordUserId: string, guildId: string): string {
  return `${guildId}:${discordUserId}`;
}

export async function isContextMuted(
  discordUserId: string,
  guildId: string
): Promise<boolean> {
  const key = cacheKey(discordUserId, guildId);
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const result = await pool.query(
    `SELECT 1 FROM context_muted_users
     WHERE discord_user_id = $1 AND guild_id = $2 LIMIT 1`,
    [discordUserId, guildId]
  );
  const muted = result.rows.length > 0;
  cache.set(key, muted);
  return muted;
}

export async function muteContext(
  discordUserId: string,
  guildId: string
): Promise<void> {
  await pool.query(
    `INSERT INTO context_muted_users (discord_user_id, guild_id)
     VALUES ($1, $2)
     ON CONFLICT (discord_user_id, guild_id) DO NOTHING`,
    [discordUserId, guildId]
  );
  cache.set(cacheKey(discordUserId, guildId), true);
}

export async function unmuteContext(
  discordUserId: string,
  guildId: string
): Promise<void> {
  await pool.query(
    `DELETE FROM context_muted_users
     WHERE discord_user_id = $1 AND guild_id = $2`,
    [discordUserId, guildId]
  );
  cache.set(cacheKey(discordUserId, guildId), false);
}
