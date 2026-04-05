import { env } from "../config.js";
import { Cache } from "./cache.js";

interface MemberInfo {
  displayName: string;
}

// Cache per "guildId:userId" → display name (10-min TTL)
const cache = new Cache<MemberInfo>(10 * 60 * 1000);

/**
 * Fetch a guild member's display name via the Discord API.
 * Returns the guild nickname if set, otherwise the global display name / username.
 */
async function fetchMember(guildId: string, userId: string): Promise<MemberInfo | null> {
  if (!env.discordBotToken) return null;

  const key = `${guildId}:${userId}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const res = await fetch(
    `https://discord.com/api/v10/guilds/${guildId}/members/${userId}`,
    { headers: { Authorization: `Bot ${env.discordBotToken}` } }
  );

  if (res.ok) {
    const data = (await res.json()) as {
      nick: string | null;
      user: { global_name: string | null; username: string };
    };
    const info: MemberInfo = {
      displayName: data.nick ?? data.user.global_name ?? data.user.username,
    };
    cache.set(key, info);
    return info;
  }

  // User may have left the guild — fall back to the global user endpoint
  const userRes = await fetch(
    `https://discord.com/api/v10/users/${userId}`,
    { headers: { Authorization: `Bot ${env.discordBotToken}` } }
  );

  if (!userRes.ok) return null;

  const userData = (await userRes.json()) as {
    global_name: string | null;
    username: string;
  };
  const info: MemberInfo = {
    displayName: userData.global_name ?? userData.username,
  };
  cache.set(key, info);
  return info;
}

/**
 * Resolve a list of user IDs to display names within a guild.
 * Returns a map of userId → displayName. Missing/failed lookups fall back to the raw ID.
 */
export async function resolveDisplayNames(
  guildId: string,
  userIds: string[]
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const lookups = await Promise.all(
    userIds.map(async (uid) => {
      const info = await fetchMember(guildId, uid);
      return [uid, info?.displayName ?? uid] as const;
    })
  );
  for (const [uid, name] of lookups) {
    results.set(uid, name);
  }
  return results;
}
