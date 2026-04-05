import type { AdminUserContext } from "@quinn/shared";
import { pool } from "./pool.js";
import { rowToAdminUserContext } from "./mapDbRow.js";
import { Cache } from "../lib/cache.js";

const cache = new Cache<AdminUserContext | null>(5 * 60 * 1000); // 5 min

function key(discordUserId: string, guildId: string) {
  return `${discordUserId}:${guildId}`;
}

export async function getAdminUserContext(
  discordUserId: string,
  guildId: string
): Promise<AdminUserContext | null> {
  const k = key(discordUserId, guildId);
  const cached = cache.get(k);
  if (cached !== undefined) return cached;

  const result = await pool.query(
    "SELECT * FROM admin_user_context WHERE discord_user_id = $1 AND guild_id = $2",
    [discordUserId, guildId]
  );
  const context = result.rows[0] ? rowToAdminUserContext(result.rows[0]) : null;
  cache.set(k, context);
  return context;
}

export async function upsertAdminUserContext(
  discordUserId: string,
  guildId: string,
  context: string
): Promise<AdminUserContext> {
  const result = await pool.query(
    `INSERT INTO admin_user_context (discord_user_id, guild_id, context, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (discord_user_id, guild_id) DO UPDATE SET context = EXCLUDED.context, updated_at = NOW()
     RETURNING *`,
    [discordUserId, guildId, context]
  );
  const updated = rowToAdminUserContext(result.rows[0]);
  cache.set(key(discordUserId, guildId), updated);
  return updated;
}

export async function deleteAdminUserContext(
  discordUserId: string,
  guildId: string
): Promise<void> {
  await pool.query(
    "DELETE FROM admin_user_context WHERE discord_user_id = $1 AND guild_id = $2",
    [discordUserId, guildId]
  );
  cache.delete(key(discordUserId, guildId));
}
