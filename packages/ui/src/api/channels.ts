import type { ChannelConfig, UpdateChannelConfigRequest, DiscordChannel } from "@quinn/shared";
import { api } from "./client.js";

export const channelsApi = {
  listDiscord: (guildId: string) =>
    api.get<DiscordChannel[]>(`/guilds/${guildId}/discord-channels`),
  listConfigs: (guildId: string) =>
    api.get<{ configs: ChannelConfig[] }>(`/guilds/${guildId}/channel-configs`),
  getConfig: (guildId: string, channelId: string) =>
    api.get<{ config: ChannelConfig }>(`/guilds/${guildId}/channels/${channelId}/config`),
  updateConfig: (guildId: string, channelId: string, updates: UpdateChannelConfigRequest) =>
    api.put<{ config: ChannelConfig }>(`/guilds/${guildId}/channels/${channelId}/config`, updates),
  deleteConfig: (guildId: string, channelId: string) =>
    api.delete(`/guilds/${guildId}/channels/${channelId}/config`),
};
