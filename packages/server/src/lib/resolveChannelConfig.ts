import type { ServerConfig, ChannelConfig, ResolvedChannelConfig } from "@quinn/shared";

/**
 * Merges server-level and channel-level config into a single resolved config
 * that the bot uses to make decisions. Pure function — no DB or Express dependencies.
 *
 * Resolution rules:
 * - Global booleans (respondIfMentioned, respondToAll, displayThoughts) are "master on" switches:
 *   if the server enables them, they are always enabled regardless of channel setting.
 * - responseRate: channel overrides server when set.
 * - activePrompt: channel prompt overrides server prompt when set.
 * - forbiddenWords: deduplicated union of server + channel lists.
 */
export function resolveChannelConfig(
  server: ServerConfig,
  channel: ChannelConfig | null,
  globalForbiddenWords: string[] = []
): ResolvedChannelConfig {
  const forbiddenWords = [...new Set([...globalForbiddenWords, ...server.forbiddenWords, ...(channel?.forbiddenWords ?? [])])];

  return {
    guildId: server.guildId,
    channelId: channel?.channelId ?? "",
    respondIfMentioned:
      server.respondIfMentioned || (channel?.respondIfMentioned ?? false),
    respondToAll:
      server.respondToAll || (channel?.respondToAll ?? false),
    displayThoughts:
      server.displayThoughts || (channel?.displayThoughts ?? false),
    responseRate: channel?.responseRate ?? server.responseRate,
    activePrompt: channel?.channelPrompt ?? server.serverPrompt,
    forbiddenWords,
    forbiddenWordReply: server.forbiddenWordReply,
  };
}
