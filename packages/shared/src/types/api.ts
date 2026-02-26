import type { ServerConfig, ChannelConfig } from "./config.js";
import type { UserContext, AdminUserContext } from "./user.js";

export type UpdateServerConfigRequest = Partial<
  Omit<ServerConfig, "guildId">
>;

export interface GetServerConfigResponse {
  config: ServerConfig;
}

export type UpdateChannelConfigRequest = Partial<
  Omit<ChannelConfig, "channelId" | "guildId">
>;

export interface GetChannelConfigResponse {
  config: ChannelConfig;
}

export interface UpdateUserContextRequest {
  context: string;
}

export interface GetUserContextResponse {
  userContext: UserContext | null;
}

export interface UpdateAdminUserContextRequest {
  discordUserId: string;
  context: string;
}

export interface AddForbiddenUserRequest {
  discordUserId: string;
}

export interface GetSystemPromptResponse {
  prompt: string;
}

export interface UpdateSystemPromptRequest {
  prompt: string;
}

export interface DiscordChannel {
  id: string;
  name: string;
  type: number; // 0=text, 4=category, 5=announcement
  parent_id: string | null;
  position: number;
}

export interface GetContextMessageLimitResponse {
  limit: number;
}

export interface UpdateContextMessageLimitRequest {
  limit: number;
}

export interface ApiError {
  error: string;
  code?: string;
}
