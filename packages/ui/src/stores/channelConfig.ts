import { ref } from "vue";
import { defineStore } from "pinia";
import type { ChannelConfig, UpdateChannelConfigRequest } from "@quinn/shared";
import { channelsApi } from "../api/channels.js";

function key(guildId: string, channelId: string) {
  return `${guildId}:${channelId}`;
}

export const useChannelConfigStore = defineStore("channelConfig", () => {
  const configs = ref(new Map<string, ChannelConfig | null>());

  async function fetchAll(guildId: string): Promise<void> {
    const res = await channelsApi.listConfigs(guildId);
    for (const config of res.configs) {
      configs.value.set(key(guildId, config.channelId), config);
    }
  }

  async function fetch(guildId: string, channelId: string): Promise<void> {
    try {
      const res = await channelsApi.getConfig(guildId, channelId);
      configs.value.set(key(guildId, channelId), res.config);
    } catch {
      configs.value.set(key(guildId, channelId), null);
    }
  }

  async function save(
    guildId: string,
    channelId: string,
    updates: UpdateChannelConfigRequest
  ): Promise<void> {
    const res = await channelsApi.updateConfig(guildId, channelId, updates);
    configs.value.set(key(guildId, channelId), res.config);
  }

  async function remove(guildId: string, channelId: string): Promise<void> {
    await channelsApi.deleteConfig(guildId, channelId);
    configs.value.delete(key(guildId, channelId));
  }

  function get(guildId: string, channelId: string): ChannelConfig | null | undefined {
    return configs.value.get(key(guildId, channelId));
  }

  return { configs, fetchAll, fetch, save, remove, get };
});
