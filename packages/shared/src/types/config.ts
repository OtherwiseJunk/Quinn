export interface ServerConfig {
  guildId: string;
  respondIfMentioned: boolean;
  respondToAll: boolean;
  forbiddenWords: string[];
  forbiddenWordReply: string;
  displayThoughts: boolean;
  serverPrompt: string | null;
  responseRate: number;
}

/**
 * Channel-specific overrides. Fields not set inherit from ServerConfig.
 * forbiddenWords are additive (merged with server list, not replacing).
 */
export interface ChannelConfig {
  channelId: string;
  guildId: string;
  respondIfMentioned: boolean | null;
  respondToAll: boolean | null;
  forbiddenWords: string[];
  /** When set, overrides the server-level responseRate for this channel */
  responseRate: number | null;
  displayThoughts: boolean | null;
  /** When set, overrides the server-level serverPrompt for this channel */
  channelPrompt: string | null;
}

/** Resolved config after merging server-level and channel-level settings */
export interface ResolvedChannelConfig {
  guildId: string;
  channelId: string;
  respondIfMentioned: boolean;
  respondToAll: boolean;
  forbiddenWords: string[];
  forbiddenWordReply: string;
  displayThoughts: boolean;
  activePrompt: string | null;
  responseRate: number;
}
