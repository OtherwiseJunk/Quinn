import { ref } from "vue";
import { defineStore } from "pinia";
import type { ServerConfig, UpdateServerConfigRequest } from "@quinn/shared";
import { guildsApi } from "../api/guilds.js";

export const useGuildConfigStore = defineStore("guildConfig", () => {
  const configs = ref(new Map<string, ServerConfig>());
  const loading = ref(new Set<string>());

  async function fetch(guildId: string): Promise<void> {
    if (loading.value.has(guildId)) return;
    loading.value.add(guildId);
    try {
      const res = await guildsApi.getConfig(guildId);
      configs.value.set(guildId, res.config);
    } finally {
      loading.value.delete(guildId);
    }
  }

  async function save(guildId: string, updates: UpdateServerConfigRequest): Promise<void> {
    const res = await guildsApi.updateConfig(guildId, updates);
    configs.value.set(guildId, res.config);
  }

  return { configs, fetch, save };
});
