import type { ForbiddenUser, AdminUserContext } from "@quinn/shared";
import { api } from "./client.js";

export interface ConfiguredUser {
  discordUserId: string;
  displayName: string;
  hasAdminNotes: boolean;
  isBanned: boolean;
  isContextMuted: boolean;
}

export interface TimeoutStatus {
  isTimedOut: boolean;
  expiresAt: string | null;
  level: number | null;
  nextDecayAt: string | null;
}

export const guildUsersApi = {
  getConfiguredUsers: (guildId: string) =>
    api.get<ConfiguredUser[]>(`/guilds/${guildId}/configured-users`),

  listForbidden: (guildId: string) =>
    api.get<ForbiddenUser[]>(`/guilds/${guildId}/forbidden-users`),
  addForbidden: (guildId: string, discordUserId: string) =>
    api.post<ForbiddenUser>(`/guilds/${guildId}/forbidden-users`, { discordUserId }),
  removeForbidden: (guildId: string, userId: string) =>
    api.delete(`/guilds/${guildId}/forbidden-users/${userId}`),

  getDisplayName: (guildId: string, userId: string) =>
    api.get<{ displayName: string }>(`/guilds/${guildId}/users/${userId}/display-name`),

  getAdminContext: (guildId: string, userId: string) =>
    api.get<{ context: AdminUserContext | null }>(
      `/guilds/${guildId}/users/${userId}/admin-context`
    ),
  updateAdminContext: (guildId: string, userId: string, context: string) =>
    api.put<AdminUserContext>(`/guilds/${guildId}/users/${userId}/admin-context`, { context }),
  deleteAdminContext: (guildId: string, userId: string) =>
    api.delete(`/guilds/${guildId}/users/${userId}/admin-context`),

  getContextMuted: (guildId: string, userId: string) =>
    api.get<{ muted: boolean }>(`/guilds/${guildId}/users/${userId}/context-muted`),
  setContextMuted: (guildId: string, userId: string, muted: boolean) =>
    api.put<{ muted: boolean }>(`/guilds/${guildId}/users/${userId}/context-muted`, { muted }),

  getTimeoutStatus: (guildId: string, userId: string) =>
    api.get<TimeoutStatus>(`/guilds/${guildId}/users/${userId}/timeout-status`),
  updateTimeoutStatus: (guildId: string, userId: string, active: boolean, level: number) =>
    api.put<TimeoutStatus>(`/guilds/${guildId}/users/${userId}/timeout-status`, { active, level }),
};
