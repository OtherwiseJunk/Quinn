import { pool } from "./pool.js";
import { Cache } from "../lib/cache.js";

// Cache per "guildId:userId" → whether they're timed out (2-min TTL)
const cache = new Cache<boolean>(2 * 60 * 1000);

function cacheKey(discordUserId: string, guildId: string): string {
  return `${guildId}:${discordUserId}`;
}

export async function isTimedOut(
  discordUserId: string,
  guildId: string
): Promise<boolean> {
  const key = cacheKey(discordUserId, guildId);
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const result = await pool.query(
    `SELECT 1 FROM bot_timeouts
     WHERE discord_user_id = $1 AND guild_id = $2 AND expires_at > NOW()
     LIMIT 1`,
    [discordUserId, guildId]
  );
  const timedOut = result.rows.length > 0;
  cache.set(key, timedOut);
  return timedOut;
}

export async function addTimeout(
  discordUserId: string,
  guildId: string,
  durationHours: number
): Promise<void> {
  await pool.query(
    `INSERT INTO bot_timeouts (discord_user_id, guild_id, duration_hours, expires_at)
     VALUES ($1, $2, $3, NOW() + make_interval(hours => $3))
     ON CONFLICT (discord_user_id, guild_id)
     DO UPDATE SET duration_hours = $3,
                   expires_at = NOW() + make_interval(hours => $3),
                   created_at = NOW()`,
    [discordUserId, guildId, durationHours]
  );
  cache.delete(cacheKey(discordUserId, guildId));
}

/** Duration map: level → hours (0 = warning with no timeout) */
const ESCALATION_HOURS: Record<number, number | null> = {
  0: null,
  1: 1,
  2: 4,
  3: 8,
};

/**
 * Determine the next escalation level for a user in a guild.
 * If the most recent discipline entry is still within the cooldown window
 * (expires_at + 24hr for timeouts, created_at + 24hr for warnings), escalate.
 * Otherwise reset to 0.
 */
export async function getEscalationLevel(
  discordUserId: string,
  guildId: string
): Promise<number> {
  const result = await pool.query(
    `SELECT level, expires_at, created_at FROM timeout_history
     WHERE discord_user_id = $1 AND guild_id = $2
     ORDER BY created_at DESC LIMIT 1`,
    [discordUserId, guildId]
  );
  if (result.rows.length === 0) return 0;

  const { level, expires_at, created_at } = result.rows[0];
  // Cooldown anchor: expires_at for timeouts, created_at for warnings
  const anchor = expires_at ? new Date(expires_at) : new Date(created_at);
  const cooldownEnd = new Date(anchor.getTime() + 24 * 60 * 60 * 1000);

  if (new Date() < cooldownEnd) {
    return Math.min(level + 1, 3);
  }
  return 0;
}

/**
 * Record a disciplinary action and apply a timeout if escalation level > 0.
 * Returns the level and duration so the bot can message appropriately.
 */
export async function recordDiscipline(
  discordUserId: string,
  guildId: string
): Promise<{ level: number; durationHours: number | null }> {
  const level = await getEscalationLevel(discordUserId, guildId);
  const durationHours = ESCALATION_HOURS[level] ?? null;

  if (durationHours !== null) {
    // Insert history row with expiry
    await pool.query(
      `INSERT INTO timeout_history (discord_user_id, guild_id, level, expires_at)
       VALUES ($1, $2, $3, NOW() + make_interval(hours => $4))`,
      [discordUserId, guildId, level, durationHours]
    );
    // Also apply the actual bot timeout (so the user is ignored)
    await addTimeout(discordUserId, guildId, durationHours);
  } else {
    // Warning — no expiry, no bot_timeout row
    await pool.query(
      `INSERT INTO timeout_history (discord_user_id, guild_id, level)
       VALUES ($1, $2, $3)`,
      [discordUserId, guildId, level]
    );
  }

  console.log(
    `[Quinn] Discipline: user ${discordUserId} in guild ${guildId} → level ${level}` +
    (durationHours ? ` (${durationHours}h timeout)` : " (warning)")
  );

  return { level, durationHours };
}

/**
 * Get the full timeout status for a user in a guild:
 * whether they're timed out, when it expires, their current discipline level,
 * and when the next decay will reduce their level.
 */
export async function getTimeoutStatus(
  discordUserId: string,
  guildId: string,
): Promise<{
  isTimedOut: boolean;
  expiresAt: string | null;
  level: number | null;
  nextDecayAt: string | null;
}> {
  // Check active timeout
  const timeoutResult = await pool.query(
    `SELECT expires_at FROM bot_timeouts
     WHERE discord_user_id = $1 AND guild_id = $2 AND expires_at > NOW()
     LIMIT 1`,
    [discordUserId, guildId],
  );

  const activeTimeout = timeoutResult.rows[0];
  const isTimedOut = !!activeTimeout;
  const expiresAt = activeTimeout ? (activeTimeout.expires_at as Date).toISOString() : null;

  // Check latest discipline history for level + decay timing
  const historyResult = await pool.query(
    `SELECT level, expires_at, created_at FROM timeout_history
     WHERE discord_user_id = $1 AND guild_id = $2
     ORDER BY created_at DESC LIMIT 1`,
    [discordUserId, guildId],
  );

  if (historyResult.rows.length === 0) {
    return { isTimedOut, expiresAt, level: null, nextDecayAt: null };
  }

  const { level, expires_at: histExpires, created_at } = historyResult.rows[0];
  const anchor = histExpires ? new Date(histExpires) : new Date(created_at);
  const nextDecayAt = new Date(anchor.getTime() + DECAY_HOURS * 60 * 60 * 1000).toISOString();

  return { isTimedOut, expiresAt, level: level as number, nextDecayAt };
}

export async function cleanupExpired(): Promise<number> {
  const result = await pool.query(
    "DELETE FROM bot_timeouts WHERE expires_at <= NOW()"
  );
  const count = result.rowCount ?? 0;
  if (count > 0) {
    console.log(`[Quinn] Cleaned up ${count} expired timeout(s)`);
  }
  return count;
}

const DECAY_HOURS = 8;

/**
 * Decay discipline severity over time.
 * For each user/guild, looks at the most recent timeout_history row:
 * - If level > 0 and the cooldown anchor is older than DECAY_HOURS: decrement level
 * - If level = 0 and created_at is older than DECAY_HOURS: delete the row
 *
 * This makes escalation bi-directional: offenders escalate on repeated abuse,
 * but severity naturally decreases when they behave.
 */
export async function decayDiscipline(): Promise<{ decremented: number; deleted: number }> {
  // CTE finds the most recent history row per user/guild pair
  const latestRows = `
    SELECT DISTINCT ON (discord_user_id, guild_id) id, level, expires_at, created_at
    FROM timeout_history
    ORDER BY discord_user_id, guild_id, created_at DESC`;

  // Delete stale warnings first (level 0, anchor older than DECAY_HOURS)
  const deleted = await pool.query(
    `DELETE FROM timeout_history
     WHERE id IN (
       SELECT id FROM (${latestRows}) latest
       WHERE level = 0
         AND created_at < NOW() - interval '${DECAY_HOURS} hours'
     )`
  );

  // Decrement level for rows > 0 whose anchor has aged past the cutoff
  const decremented = await pool.query(
    `UPDATE timeout_history SET level = level - 1
     WHERE id IN (
       SELECT id FROM (${latestRows}) latest
       WHERE level > 0
         AND COALESCE(expires_at, created_at) < NOW() - interval '${DECAY_HOURS} hours'
     )`
  );

  const decCount = decremented.rowCount ?? 0;
  const delCount = deleted.rowCount ?? 0;
  if (decCount > 0 || delCount > 0) {
    console.log(`[Quinn] Discipline decay: ${decCount} decremented, ${delCount} warning(s) cleared`);
  }
  return { decremented: decCount, deleted: delCount };
}

export async function clearBotTimeout(
  discordUserId: string,
  guildId: string
): Promise<void> {
  await pool.query(
    `DELETE FROM bot_timeouts WHERE discord_user_id = $1 AND guild_id = $2`,
    [discordUserId, guildId]
  );
  cache.delete(cacheKey(discordUserId, guildId));
}

export async function setDisciplineLevel(
  discordUserId: string,
  guildId: string,
  level: 0 | 1 | 2 | 3
): Promise<void> {
  await pool.query(
    `INSERT INTO timeout_history (discord_user_id, guild_id, level)
     VALUES ($1, $2, $3)`,
    [discordUserId, guildId, level]
  );
}
