import { api } from "./client.js";

export interface GuildUsageSummary {
  groqPromptTokens: number;
  groqCompletionTokens: number;
  groqCalls: number;
  e2bExecutionMs: number;
  estimatedCostUsd: number;
  rawCostUsd: number;
}

export interface GuildUsageRow extends GuildUsageSummary {
  guildId: string;
}

export interface UsageOverview {
  totals: GuildUsageSummary;
  guilds: GuildUsageRow[];
}

export type UsagePeriod = "24h" | "7d" | "30d" | "all";

export interface MemoryItem {
  id: number;
  guildId: string;
  subjectUserId: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryUser {
  userId: string;
  displayName: string;
  count: number;
}

export const adminApi = {
  getSystemPrompt: () => api.get<{ prompt: string }>("/admin/system-prompt"),
  updateSystemPrompt: (prompt: string) =>
    api.put<{ prompt: string }>("/admin/system-prompt", { prompt }),
  getGlobalForbiddenWords: () =>
    api.get<{ words: string[] }>("/admin/global-forbidden-words"),
  updateGlobalForbiddenWords: (words: string[]) =>
    api.put<{ words: string[] }>("/admin/global-forbidden-words", { words }),
  getContextMessageLimit: () =>
    api.get<{ limit: number }>("/admin/context-message-limit"),
  updateContextMessageLimit: (limit: number) =>
    api.put<{ limit: number }>("/admin/context-message-limit", { limit }),
  getUsageOverview: (period: UsagePeriod) =>
    api.get<UsageOverview>(`/admin/usage?period=${period}`),
  getGuildUsage: (guildId: string, period: UsagePeriod) =>
    api.get<GuildUsageSummary>(`/admin/usage/${guildId}?period=${period}`),
  getMemories: (guildId: string, userId?: string) =>
    api.get<MemoryItem[]>(`/admin/memories/${guildId}${userId ? `?userId=${userId}` : ""}`),
  getMemoryUsers: (guildId: string) =>
    api.get<MemoryUser[]>(`/admin/memories/${guildId}/users`),
  createMemory: (guildId: string, subjectUserId: string | null, content: string) =>
    api.post<{ ok: true }>(`/admin/memories/${guildId}`, { subjectUserId, content }),
  updateMemory: (guildId: string, memoryId: number, content: string) =>
    api.put<{ ok: true }>(`/admin/memories/${guildId}/${memoryId}`, { content }),
  deleteMemory: (guildId: string, memoryId: number) =>
    api.delete(`/admin/memories/${guildId}/${memoryId}`),
};
