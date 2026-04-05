import type { ServerConfig } from "@quinn/shared";
import { pool } from "./pool.js";
import { rowToServerConfig } from "./mapDbRow.js";
import { Cache } from "../lib/cache.js";

const cache = new Cache<ServerConfig>(5 * 60 * 1000); // 5 min

export async function getServerConfig(guildId: string): Promise<ServerConfig> {
  const cached = cache.get(guildId);
  if (cached) return cached;

  await pool.query(
    "INSERT INTO server_config (guild_id) VALUES ($1) ON CONFLICT (guild_id) DO NOTHING",
    [guildId]
  );
  const result = await pool.query(
    "SELECT * FROM server_config WHERE guild_id = $1",
    [guildId]
  );
  const config = rowToServerConfig(result.rows[0]);
  cache.set(guildId, config);
  return config;
}

export async function upsertServerConfig(
  guildId: string,
  updates: Partial<Omit<ServerConfig, "guildId">>
): Promise<ServerConfig> {
  const fields: string[] = [];
  const values: unknown[] = [guildId];
  let idx = 2;

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
  if (updates.forbiddenWordReply !== undefined) {
    fields.push(`forbidden_word_reply = $${idx++}`);
    values.push(updates.forbiddenWordReply);
  }
  if (updates.displayThoughts !== undefined) {
    fields.push(`display_thoughts = $${idx++}`);
    values.push(updates.displayThoughts);
  }
  if (updates.serverPrompt !== undefined) {
    fields.push(`server_prompt = $${idx++}`);
    values.push(updates.serverPrompt);
  }
  if (updates.responseRate !== undefined) {
    fields.push(`response_rate = $${idx++}`);
    values.push(updates.responseRate);
  }

  if (fields.length === 0) return getServerConfig(guildId);

  fields.push("updated_at = NOW()");

  const result = await pool.query(
    `INSERT INTO server_config (guild_id) VALUES ($1)
     ON CONFLICT (guild_id) DO UPDATE SET ${fields.join(", ")}
     RETURNING *`,
    values
  );
  const config = rowToServerConfig(result.rows[0]);
  cache.set(guildId, config);
  return config;
}
