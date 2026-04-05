import { ref } from "vue";
import { defineStore } from "pinia";
import { adminApi } from "../api/admin.js";
import type { MemoryItem, MemoryUser } from "../api/admin.js";

export const useMemoryStore = defineStore("memory", () => {
  const memories = ref<MemoryItem[]>([]);
  const status = ref<"idle" | "loading" | "error">("idle");

  const users = ref<MemoryUser[]>([]);
  const usersStatus = ref<"idle" | "loading" | "error">("idle");

  const errorMessage = ref("");

  async function fetchMemories(guildId: string, userId?: string): Promise<void> {
    status.value = "loading";
    errorMessage.value = "";
    try {
      memories.value = await adminApi.getMemories(guildId, userId);
      status.value = "idle";
    } catch (e) {
      status.value = "error";
      errorMessage.value = e instanceof Error ? e.message : "Failed to load memories";
    }
  }

  async function fetchUsers(guildId: string): Promise<void> {
    usersStatus.value = "loading";
    try {
      users.value = await adminApi.getMemoryUsers(guildId);
      usersStatus.value = "idle";
    } catch {
      usersStatus.value = "error";
    }
  }

  async function create(guildId: string, subjectUserId: string | null, content: string): Promise<void> {
    await adminApi.createMemory(guildId, subjectUserId, content);
    await fetchMemories(guildId, subjectUserId ?? undefined);
  }

  async function update(guildId: string, memoryId: number, content: string, userId?: string): Promise<void> {
    await adminApi.updateMemory(guildId, memoryId, content);
    await fetchMemories(guildId, userId);
  }

  async function remove(guildId: string, memoryId: number, userId?: string): Promise<void> {
    await adminApi.deleteMemory(guildId, memoryId);
    await fetchMemories(guildId, userId);
  }

  return { memories, status, errorMessage, users, usersStatus, fetchMemories, fetchUsers, create, update, remove };
});
