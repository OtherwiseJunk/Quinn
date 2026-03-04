import type {
  ResolvedChannelConfig,
  GroqRequestContext,
  UserContext,
  BotMemory,
} from "@quinn/shared";
import { env } from "../env.js";

const headers = {
  "X-Bot-Secret": env.internalBotSecret,
  "Content-Type": "application/json",
};

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${env.serverUrl}/api/bot${path}`, { headers });
  if (!res.ok) {
    throw new Error(`Server API error ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${env.serverUrl}/api/bot${path}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Server API error ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${env.serverUrl}/api/bot${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Server API error ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

async function del<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${env.serverUrl}/api/bot${path}`, {
    method: "DELETE",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Server API error ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${env.serverUrl}/api/bot${path}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Server API error ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export async function getResolvedConfig(
  guildId: string,
  channelId: string
): Promise<ResolvedChannelConfig> {
  return get(`/guilds/${guildId}/channels/${channelId}/resolved-config`);
}

export async function getContextBundle(
  guildId: string,
  userId: string
): Promise<GroqRequestContext> {
  return get(`/guilds/${guildId}/users/${userId}/context-bundle`);
}

export async function isForbiddenUser(
  guildId: string,
  userId: string
): Promise<boolean> {
  const data = await get<{ forbidden: boolean }>(
    `/guilds/${guildId}/forbidden-users/${userId}`
  );
  return data.forbidden;
}

export async function getForbiddenUserIds(
  guildId: string,
  userIds: string[]
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const data = await post<{ forbiddenIds: string[] }>(
    `/guilds/${guildId}/forbidden-users/batch`,
    { userIds }
  );
  return new Set(data.forbiddenIds);
}

export async function getUserContext(
  userId: string
): Promise<UserContext | null> {
  const data = await get<{ userContext: UserContext | null }>(
    `/users/${userId}/context`
  );
  return data.userContext;
}

export async function updateUserContext(
  userId: string,
  context: string
): Promise<UserContext> {
  return put(`/users/${userId}/context`, { context });
}

/** Get memories for a user in a guild, or Quinn's self memories (userId=null) */
export async function getMemories(
  guildId: string,
  userId: string | null
): Promise<BotMemory[]> {
  const query = userId ? `?userId=${userId}` : "";
  const data = await get<{ memories: BotMemory[] }>(
    `/guilds/${guildId}/memories${query}`
  );
  return data.memories;
}

export async function saveMemories(
  guildId: string,
  subjectUserId: string | null,
  memories: string[]
): Promise<void> {
  await post(`/guilds/${guildId}/memories`, { subjectUserId, memories });
}

export async function deleteMemoriesById(
  guildId: string,
  ids: number[]
): Promise<void> {
  await del(`/guilds/${guildId}/memories`, { ids });
}

export async function updateMemoriesById(
  guildId: string,
  updates: { id: number; content: string }[]
): Promise<void> {
  await patch(`/guilds/${guildId}/memories`, { updates });
}

export async function disciplineUser(
  guildId: string,
  userId: string
): Promise<{ level: number; durationHours: number | null }> {
  return post(`/guilds/${guildId}/timeouts/${userId}`, {});
}

export async function reportUsage(record: {
  guildId: string;
  channelId: string;
  userId: string;
  groqPromptTokens: number;
  groqCompletionTokens: number;
  groqCalls: number;
  e2bExecutionMs?: number;
  e2bSuccess?: boolean;
  estimatedCostUsd: number;
}): Promise<void> {
  await post("/usage", record);
}

export async function getPendingConsolidation(
  guildId: string
): Promise<{ subjectUserId: string | null; memories: BotMemory[] }[]> {
  const data = await get<{
    groups: { subjectUserId: string | null; memories: BotMemory[] }[];
  }>(`/guilds/${guildId}/memories/pending-consolidation`);
  return data.groups;
}

export async function consolidateMemories(
  guildId: string,
  keepIds: number[],
  deleteIds: number[],
  merged?: { content: string; subjectUserId: string | null }[]
): Promise<void> {
  await post(`/guilds/${guildId}/memories/consolidate`, {
    keepIds,
    deleteIds,
    merged,
  });
}
