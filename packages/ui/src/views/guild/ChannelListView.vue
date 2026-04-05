<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import AppShell from "../../components/layout/AppShell.vue";
import EmptyState from "../../components/ui/EmptyState.vue";
import GuildSelectorDropdown from "../../components/guild/GuildSelectorDropdown.vue";
import ChannelSelectorDropdown from "../../components/guild/ChannelSelectorDropdown.vue";
import { useChannelConfigStore } from "../../stores/channelConfig.js";
import { useAuthStore } from "../../stores/auth.js";
import { useCurrentGuild } from "../../composables/useCurrentGuild.js";
import { channelsApi } from "../../api/channels.js";
import type { DiscordChannel } from "@quinn/shared";

const store = useChannelConfigStore();
const auth = useAuthStore();
const { guildId } = useCurrentGuild();

const discordChannels = ref<DiscordChannel[]>([]);

onMounted(async () => {
  // These are independent — don't let a Discord API failure prevent the config list from loading
  await store.fetchAll(guildId.value).catch(() => {});
  channelsApi.listDiscord(guildId.value)
    .then((ch) => { discordChannels.value = ch; })
    .catch(() => {}); // dropdown handles its own error state
});

const nameMap = computed(() => {
  const m = new Map<string, string>();
  for (const ch of discordChannels.value) m.set(ch.id, ch.name);
  return m;
});

const configuredChannels = computed(() =>
  [...store.configs.entries()]
    .filter(([k, v]) => k.startsWith(`${guildId.value}:`) && v !== null)
    .map(([k]) => k.split(":")[1])
);
</script>

<template>
  <AppShell>
    <div class="page-header">
      <GuildSelectorDropdown
        :guilds="auth.adminGuilds"
        :current-guild-id="guildId"
        :target-route="(id) => `/guilds/${id}/channels`"
      />
    </div>

    <h1 class="page-title">Channel Overrides</h1>
    <p class="page-desc">
      Select a channel to configure per-channel settings. Only channels with overrides appear
      below — Quinn uses server defaults for all others.
    </p>

    <div class="add-row">
      <span class="add-label">Configure channel:</span>
      <ChannelSelectorDropdown
        :guild-id="guildId"
        :target-route="(channelId) => `/guilds/${guildId}/channels/${channelId}`"
      />
    </div>

    <div v-if="configuredChannels.length" class="channel-list">
      <RouterLink
        v-for="channelId in configuredChannels"
        :key="channelId"
        :to="{ name: 'channel-config', params: { guildId, channelId } }"
        class="channel-row"
      >
        <span class="channel-row__name">
          # {{ nameMap.get(channelId) ?? channelId }}
        </span>
        <span class="channel-row__arrow">›</span>
      </RouterLink>
    </div>
    <EmptyState v-else message="No channel overrides configured yet." />
  </AppShell>
</template>

<style scoped>
.page-header { margin-bottom: 1.5rem; }
.page-title { margin: 0 0 0.25rem; font-size: 1.5rem; font-weight: 700; color: #fff; }
.page-desc { margin: 0 0 1.25rem; font-size: 0.875rem; color: #888; max-width: 560px; }
.add-row { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.25rem; }
.add-label { font-size: 0.875rem; color: #888; white-space: nowrap; }
.channel-list { display: flex; flex-direction: column; gap: 0.5rem; max-width: 480px; }
.channel-row { display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1rem; background: #111214; border: 1px solid #2b2c30; border-radius: 8px; text-decoration: none; color: #e0e0e0; transition: border-color 0.15s; }
.channel-row:hover { border-color: #5865f2; }
.channel-row__name { font-size: 0.875rem; font-family: monospace; }
.channel-row__arrow { color: #666; }
</style>
