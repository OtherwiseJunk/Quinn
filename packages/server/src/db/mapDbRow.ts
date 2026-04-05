/**
 * Converts snake_case Postgres rows to camelCase TypeScript types.
 * This is the only file that knows about column names.
 */

import type {
  ServerConfig,
  ChannelConfig,
  UserContext,
  AdminUserContext,
  ForbiddenUser,
  BotMemory,
} from "@quinn/shared";

export function rowToServerConfig(row: Record<string, unknown>): ServerConfig {
  return {
    guildId: row.guild_id as string,
    respondIfMentioned: row.respond_if_mentioned as boolean,
    respondToAll: row.respond_to_all as boolean,
    forbiddenWords: row.forbidden_words as string[],
    forbiddenWordReply: row.forbidden_word_reply as string,
    displayThoughts: row.display_thoughts as boolean,
    serverPrompt: row.server_prompt as string | null,
    responseRate: row.response_rate as number,
  };
}

export function rowToChannelConfig(row: Record<string, unknown>): ChannelConfig {
  return {
    channelId: row.channel_id as string,
    guildId: row.guild_id as string,
    respondIfMentioned: row.respond_if_mentioned as boolean | null,
    respondToAll: row.respond_to_all as boolean | null,
    forbiddenWords: row.forbidden_words as string[],
    responseRate: row.response_rate as number | null,
    displayThoughts: row.display_thoughts as boolean | null,
    channelPrompt: row.channel_prompt as string | null,
  };
}

export function rowToUserContext(row: Record<string, unknown>): UserContext {
  return {
    discordUserId: row.discord_user_id as string,
    context: row.context as string,
    updatedAt: row.updated_at as Date,
  };
}

export function rowToAdminUserContext(row: Record<string, unknown>): AdminUserContext {
  return {
    discordUserId: row.discord_user_id as string,
    guildId: row.guild_id as string,
    context: row.context as string,
    updatedAt: row.updated_at as Date,
  };
}

export function rowToForbiddenUser(row: Record<string, unknown>): ForbiddenUser {
  return {
    discordUserId: row.discord_user_id as string,
    guildId: row.guild_id as string,
    addedAt: row.added_at as Date,
  };
}

export function rowToBotMemory(row: Record<string, unknown>): BotMemory {
  return {
    id: row.id as number,
    guildId: row.guild_id as string,
    subjectUserId: row.subject_user_id as string | null,
    content: row.content as string,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}
