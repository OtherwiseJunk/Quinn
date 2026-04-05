import { pool } from "./pool.js";

export interface ConfiguredUser {
  discordUserId: string;
  hasAdminNotes: boolean;
  isBanned: boolean;
  isContextMuted: boolean;
}

/**
 * Find all users who have any admin configuration in a guild:
 * admin notes, banned, or context-muted.
 */
export async function getConfiguredUsers(guildId: string): Promise<ConfiguredUser[]> {
  const result = await pool.query(
    `SELECT
       u.discord_user_id,
       (a.discord_user_id IS NOT NULL) AS has_admin_notes,
       (f.discord_user_id IS NOT NULL) AS is_banned,
       (m.discord_user_id IS NOT NULL) AS is_context_muted
     FROM (
       SELECT discord_user_id FROM admin_user_context WHERE guild_id = $1
       UNION
       SELECT discord_user_id FROM forbidden_users WHERE guild_id = $1
       UNION
       SELECT discord_user_id FROM context_muted_users WHERE guild_id = $1
     ) u
     LEFT JOIN admin_user_context a
       ON a.discord_user_id = u.discord_user_id AND a.guild_id = $1
     LEFT JOIN forbidden_users f
       ON f.discord_user_id = u.discord_user_id AND f.guild_id = $1
     LEFT JOIN context_muted_users m
       ON m.discord_user_id = u.discord_user_id AND m.guild_id = $1
     ORDER BY u.discord_user_id`,
    [guildId]
  );

  return result.rows.map((r) => ({
    discordUserId: r.discord_user_id as string,
    hasAdminNotes: r.has_admin_notes as boolean,
    isBanned: r.is_banned as boolean,
    isContextMuted: r.is_context_muted as boolean,
  }));
}
