<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import type { DiscordChannel } from "@quinn/shared";
import { channelsApi } from "../../api/channels.js";

const props = defineProps<{
  guildId: string;
  currentChannelId?: string;
  targetRoute: (channelId: string) => string;
}>();

const router = useRouter();
const open = ref(false);
const channels = ref<DiscordChannel[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

onMounted(async () => {
  loading.value = true;
  error.value = null;
  try {
    channels.value = await channelsApi.listDiscord(props.guildId);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Failed to load channels";
  } finally {
    loading.value = false;
  }
});

// Group text/announcement channels under their category
const grouped = computed(() => {
  const categories = new Map<string | null, { name: string; channels: DiscordChannel[] }>();
  // Collect categories first
  for (const ch of channels.value) {
    if (ch.type === 4) categories.set(ch.id, { name: ch.name, channels: [] });
  }
  // Assign text/announcement channels to their category
  const uncategorized: DiscordChannel[] = [];
  for (const ch of channels.value) {
    if (ch.type === 0 || ch.type === 5) {
      const cat = ch.parent_id ? categories.get(ch.parent_id) : null;
      if (cat) cat.channels.push(ch);
      else uncategorized.push(ch);
    }
  }
  const result: Array<{ name: string | null; channels: DiscordChannel[] }> = [];
  if (uncategorized.length) result.push({ name: null, channels: uncategorized });
  for (const cat of categories.values()) {
    if (cat.channels.length) result.push({ name: cat.name, channels: cat.channels });
  }
  return result;
});

const currentChannel = computed(() =>
  channels.value.find((c) => c.id === props.currentChannelId) ?? null
);

function select(channelId: string) {
  open.value = false;
  if (channelId !== props.currentChannelId) {
    router.push(props.targetRoute(channelId));
  }
}
</script>

<template>
  <div class="selector" v-click-outside="() => (open = false)">
    <button type="button" class="selector__trigger" @click="open = !open" :disabled="loading">
      <span class="selector__hash">#</span>
      <span class="selector__name">
        {{ loading ? "Loading…" : (currentChannel?.name ?? currentChannelId ?? "Select channel") }}
      </span>
      <span class="selector__caret">{{ open ? '▲' : '▼' }}</span>
    </button>
    <div v-if="open" class="selector__menu">
      <template v-if="error">
        <span class="selector__empty selector__empty--error">{{ error }}</span>
      </template>
      <template v-else-if="grouped.length === 0">
        <span class="selector__empty">No text channels found</span>
      </template>
      <template v-for="group in grouped" :key="group.name ?? '__uncategorized'">
        <span v-if="group.name" class="selector__category">{{ group.name }}</span>
        <button
          v-for="ch in group.channels"
          :key="ch.id"
          type="button"
          :class="['selector__option', ch.id === currentChannelId && 'selector__option--active']"
          @click="select(ch.id)"
        >
          <span class="selector__hash">#</span>
          <span>{{ ch.name }}</span>
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.selector { position: relative; display: inline-block; }
.selector__trigger {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.75rem;
  background: #1e1f22;
  border: 1px solid #3a3b3e;
  border-radius: 8px;
  color: #e0e0e0;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: border-color 0.15s;
  min-width: 220px;
}
.selector__trigger:hover:not(:disabled) { border-color: #5865f2; }
.selector__trigger:disabled { opacity: 0.6; cursor: default; }
.selector__name { flex: 1; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.selector__hash { color: #555; font-weight: 700; }
.selector__caret { font-size: 0.6rem; color: #666; }
.selector__menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 100%;
  max-height: 320px;
  overflow-y: auto;
  background: #1e1f22;
  border: 1px solid #3a3b3e;
  border-radius: 8px;
  z-index: 50;
  display: flex;
  flex-direction: column;
  padding: 0.25rem;
}
.selector__category {
  padding: 0.5rem 0.625rem 0.25rem;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #555;
}
.selector__option {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.4rem 0.625rem;
  border: none;
  background: none;
  color: #b0b0b0;
  font-size: 0.875rem;
  cursor: pointer;
  border-radius: 5px;
  text-align: left;
}
.selector__option:hover { background: #2b2c30; color: #e0e0e0; }
.selector__option--active { color: #9da8f0; background: #5865f210; }
.selector__empty { padding: 0.5rem 0.625rem; color: #555; font-size: 0.875rem; }
.selector__empty--error { color: #f04747; }
</style>
