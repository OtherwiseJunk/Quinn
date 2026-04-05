import type { AdminGuild } from "@quinn/shared";
import { env } from "../config.js";
import { Cache } from "./cache.js";

const cache = new Cache<AdminGuild[]>(5 * 60 * 1000); // 5 min

/**
 * Fetches the list of guilds the bot is currently in.
 * Returns null if DISCORD_BOT_TOKEN is not configured.
 */
export async function getBotGuilds(): Promise<AdminGuild[] | null> {
  if (!env.discordBotToken) return null;

  const cached = cache.get("bot-guilds");
  if (cached !== undefined) return cached;

  const response = await fetch("https://discord.com/api/v10/users/@me/guilds", {
    headers: { Authorization: `Bot ${env.discordBotToken}` },
  });

  if (!response.ok) return null;

  const guilds = (await response.json()) as Array<{
    id: string;
    name: string;
    icon: string | null;
  }>;

  const result = guilds.map((g) => ({ id: g.id, name: g.name, icon: g.icon ?? null }));
  cache.set("bot-guilds", result);
  return result;
}
