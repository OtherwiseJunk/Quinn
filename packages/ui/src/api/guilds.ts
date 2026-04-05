import type { ServerConfig, UpdateServerConfigRequest } from "@quinn/shared";
import { api } from "./client.js";

export const guildsApi = {
  getConfig: (guildId: string) =>
    api.get<{ config: ServerConfig }>(`/guilds/${guildId}/config`),
  updateConfig: (guildId: string, updates: UpdateServerConfigRequest) =>
    api.put<{ config: ServerConfig }>(`/guilds/${guildId}/config`, updates),
};
