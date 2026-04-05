import type { ChannelConfig } from "@quinn/shared";
import { pool } from "./pool.js";
import { rowToChannelConfig } from "./mapDbRow.js";
import { Cache } from "../lib/cache.js";

const cache = new Cache<ChannelConfig | null>(5 * 60 * 1000); // 5 min

function key(channelId: string, guildId: string) {
  return `${channelId}:${guildId}`;
}

export async function getChannelConfig(
  channelId: string,
  guildId: string
): Promise<ChannelConfig | null> {
  const k = key(channelId, guildId);
  const cached = cache.get(k);
  if (cached !== undefined) return cached;

  const result = await pool.query(
    "SELECT * FROM channel_config WHERE channel_id = $1 AND guild_id = $2",
    [channelId, guildId]
  );
  const config = result.rows[0] ? rowToChannelConfig(result.rows[0]) : null;
  cache.set(k, config);
  return config;
}

export async function listChannelConfigs(guildId: string): Promise<ChannelConfig[]> {
  const result = await pool.query(
    "SELECT * FROM channel_config WHERE guild_id = $1 ORDER BY channel_id",
    [guildId]
  );
  return result.rows.map(rowToChannelConfig);
}

export async function upsertChannelConfig(
  channelId: string,
  guildId: string,
  updates: Partial<Omit<ChannelConfig, "channelId" | "guildId">>
): Promise<ChannelConfig> {
  const fields: string[] = [];
  const values: unknown[] = [channelId, guildId];
  let idx = 3;

  if (updates.respondIfMentioned !== undefined) {
    fields.push(`respond_if_mentioned = $${idx++}`);
    values.push(updates.respondIfMentioned);
  }
  if (updates.respondToAll !== undefined) {
    fields.push(`respond_to_all = $${idx++}`);
    values.push(updates.respondToAll);
  }
  if (updates.forbiddenWords !== undefined) {
    fields.push(`forbidden_words = $${idx++}`);
    values.push(updates.forbiddenWords);
  }
  if (updates.responseRate !== undefined) {
    fields.push(`response_rate = $${idx++}`);
    values.push(updates.responseRate);
  }
  if (updates.displayThoughts !== undefined) {
    fields.push(`display_thoughts = $${idx++}`);
    values.push(updates.displayThoughts);
  }
  if (updates.channelPrompt !== undefined) {
    fields.push(`channel_prompt = $${idx++}`);
    values.push(updates.channelPrompt);
  }

  if (fields.length === 0) {
    const existing = await getChannelConfig(channelId, guildId);
    if (existing) return existing;
  }

  fields.push("updated_at = NOW()");

  const result = await pool.query(
    `INSERT INTO channel_config (channel_id, guild_id) VALUES ($1, $2)
     ON CONFLICT (channel_id, guild_id) DO UPDATE SET ${fields.join(", ")}
     RETURNING *`,
    values
  );
  const config = rowToChannelConfig(result.rows[0]);
  cache.set(key(channelId, guildId), config);
  return config;
}

export async function deleteChannelConfig(
  channelId: string,
  guildId: string
): Promise<void> {
  await pool.query(
    "DELETE FROM channel_config WHERE channel_id = $1 AND guild_id = $2",
    [channelId, guildId]
  );
  cache.delete(key(channelId, guildId));
}
