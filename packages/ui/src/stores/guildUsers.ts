import { ref } from "vue";
import { defineStore } from "pinia";
import type { ForbiddenUser, AdminUserContext } from "@quinn/shared";
import { guildUsersApi } from "../api/guildUsers.js";
import type { ConfiguredUser, TimeoutStatus } from "../api/guildUsers.js";

function contextKey(guildId: string, userId: string) {
  return `${guildId}:${userId}`;
}

export const useGuildUsersStore = defineStore("guildUsers", () => {
  const forbiddenUsers = ref(new Map<string, ForbiddenUser[]>());
  const adminContexts = ref(new Map<string, AdminUserContext | null>());
  const contextMuted = ref(new Map<string, boolean>());
  const configuredUsers = ref(new Map<string, ConfiguredUser[]>());
  const displayNames = ref(new Map<string, string>());
  const timeoutStatuses = ref(new Map<string, TimeoutStatus | null>());

  async function fetchForbidden(guildId: string): Promise<void> {
    const users = await guildUsersApi.listForbidden(guildId);
    forbiddenUsers.value.set(guildId, users);
  }

  async function banUser(guildId: string, discordUserId: string): Promise<void> {
    const entry = await guildUsersApi.addForbidden(guildId, discordUserId);
    const current = forbiddenUsers.value.get(guildId) ?? [];
    forbiddenUsers.value.set(guildId, [entry, ...current.filter((u) => u.discordUserId !== discordUserId)]);
  }

  async function unbanUser(guildId: string, userId: string): Promise<void> {
    await guildUsersApi.removeForbidden(guildId, userId);
    const current = forbiddenUsers.value.get(guildId) ?? [];
    forbiddenUsers.value.set(guildId, current.filter((u) => u.discordUserId !== userId));
  }

  async function fetchAdminContext(guildId: string, userId: string): Promise<void> {
    const res = await guildUsersApi.getAdminContext(guildId, userId);
    adminContexts.value.set(contextKey(guildId, userId), res.context);
  }

  async function saveAdminContext(guildId: string, userId: string, context: string): Promise<void> {
    const updated = await guildUsersApi.updateAdminContext(guildId, userId, context);
    adminContexts.value.set(contextKey(guildId, userId), updated);
  }

  async function deleteAdminContext(guildId: string, userId: string): Promise<void> {
    await guildUsersApi.deleteAdminContext(guildId, userId);
    adminContexts.value.set(contextKey(guildId, userId), null);
  }

  function getAdminContext(guildId: string, userId: string): AdminUserContext | null | undefined {
    return adminContexts.value.get(contextKey(guildId, userId));
  }

  async function fetchContextMuted(guildId: string, userId: string): Promise<void> {
    const res = await guildUsersApi.getContextMuted(guildId, userId);
    contextMuted.value.set(contextKey(guildId, userId), res.muted);
  }

  async function setContextMuted(guildId: string, userId: string, muted: boolean): Promise<void> {
    await guildUsersApi.setContextMuted(guildId, userId, muted);
    contextMuted.value.set(contextKey(guildId, userId), muted);
  }

  function isContextMuted(guildId: string, userId: string): boolean {
    return contextMuted.value.get(contextKey(guildId, userId)) ?? false;
  }

  async function fetchTimeoutStatus(guildId: string, userId: string): Promise<void> {
    const status = await guildUsersApi.getTimeoutStatus(guildId, userId);
    timeoutStatuses.value.set(contextKey(guildId, userId), status);
  }

  async function saveTimeoutStatus(guildId: string, userId: string, active: boolean, level: number): Promise<void> {
    const updated = await guildUsersApi.updateTimeoutStatus(guildId, userId, active, level);
    timeoutStatuses.value.set(contextKey(guildId, userId), updated);
  }

  function getTimeoutStatus(guildId: string, userId: string): TimeoutStatus | null | undefined {
    return timeoutStatuses.value.get(contextKey(guildId, userId));
  }

  async function fetchDisplayName(guildId: string, userId: string): Promise<void> {
    const res = await guildUsersApi.getDisplayName(guildId, userId);
    displayNames.value.set(contextKey(guildId, userId), res.displayName);
  }

  function getDisplayName(guildId: string, userId: string): string | undefined {
    return displayNames.value.get(contextKey(guildId, userId));
  }

  async function fetchConfiguredUsers(guildId: string): Promise<void> {
    const users = await guildUsersApi.getConfiguredUsers(guildId);
    configuredUsers.value.set(guildId, users);
  }

  return {
    forbiddenUsers,
    fetchForbidden,
    banUser,
    unbanUser,
    fetchAdminContext,
    saveAdminContext,
    deleteAdminContext,
    getAdminContext,
    displayNames,
    fetchDisplayName,
    getDisplayName,
    configuredUsers,
    fetchConfiguredUsers,
    contextMuted,
    fetchContextMuted,
    setContextMuted,
    isContextMuted,
    fetchTimeoutStatus,
    saveTimeoutStatus,
    getTimeoutStatus,
  };
});
