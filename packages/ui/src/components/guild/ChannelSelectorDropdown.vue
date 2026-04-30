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
const query = ref("");
const channels = ref<DiscordChannel[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const activeIndex = ref(-1);

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

const categoryNames = computed(() => {
  const m = new Map<string, string>();
  for (const ch of channels.value) {
    if (ch.type === 4) m.set(ch.id, ch.name);
  }
  return m;
});

const textChannels = computed(() =>
  channels.value.filter((c) => c.type === 0 || c.type === 5)
);

const filtered = computed(() => {
  const q = query.value.toLowerCase().trim();
  if (!q) return textChannels.value;
  return textChannels.value.filter((c) => c.name.toLowerCase().includes(q));
});

const grouped = computed(() => {
  const cats = new Map<string, { name: string; channels: DiscordChannel[] }>();
  const uncategorized: DiscordChannel[] = [];
  for (const ch of filtered.value) {
    if (ch.parent_id && categoryNames.value.has(ch.parent_id)) {
      const catId = ch.parent_id;
      if (!cats.has(catId)) cats.set(catId, { name: categoryNames.value.get(catId)!, channels: [] });
      cats.get(catId)!.channels.push(ch);
    } else {
      uncategorized.push(ch);
    }
  }
  const result: Array<{ name: string | null; channels: DiscordChannel[] }> = [];
  if (uncategorized.length) result.push({ name: null, channels: uncategorized });
  for (const cat of cats.values()) result.push(cat);
  return result;
});

const flatFiltered = computed(() => grouped.value.flatMap((g) => g.channels));

function onInput() {
  open.value = true;
  activeIndex.value = -1;
}

function onFocus() {
  open.value = true;
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    activeIndex.value = Math.min(activeIndex.value + 1, flatFiltered.value.length - 1);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    activeIndex.value = Math.max(activeIndex.value - 1, 0);
  } else if (e.key === "Enter") {
    e.preventDefault();
    const ch = flatFiltered.value[activeIndex.value];
    if (ch) select(ch.id);
  } else if (e.key === "Escape") {
    open.value = false;
  }
}

function select(channelId: string) {
  open.value = false;
  query.value = "";
  activeIndex.value = -1;
  if (channelId !== props.currentChannelId) {
    router.push(props.targetRoute(channelId));
  }
}
</script>

<template>
  <div class="combobox" v-click-outside="() => (open = false)">
    <div class="combobox__input-wrap">
      <span class="combobox__hash">#</span>
      <input
        type="text"
        class="combobox__input"
        v-model="query"
        :placeholder="loading ? 'Loading…' : 'Search channels…'"
        :disabled="loading"
        @input="onInput"
        @focus="onFocus"
        @keydown="onKeydown"
      />
    </div>
    <div v-if="open" class="combobox__menu">
      <template v-if="error">
        <span class="combobox__empty combobox__empty--error">{{ error }}</span>
      </template>
      <template v-else-if="loading">
        <span class="combobox__empty">Loading…</span>
      </template>
      <template v-else-if="filtered.length === 0">
        <span class="combobox__empty">No channels match</span>
      </template>
      <template v-for="group in grouped" :key="group.name ?? '__uncategorized'">
        <span v-if="group.name" class="combobox__category">{{ group.name }}</span>
        <button
          v-for="ch in group.channels"
          :key="ch.id"
          type="button"
          :class="[
            'combobox__option',
            ch.id === currentChannelId && 'combobox__option--active',
            flatFiltered.indexOf(ch) === activeIndex && 'combobox__option--focused',
          ]"
          @click="select(ch.id)"
        >
          <span class="combobox__hash">#</span>
          <span>{{ ch.name }}</span>
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.combobox { position: relative; display: inline-block; }
.combobox__input-wrap {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.75rem;
  background: #1e1f22;
  border: 1px solid #3a3b3e;
  border-radius: 8px;
  min-width: 220px;
  transition: border-color 0.15s;
}
.combobox__input-wrap:focus-within { border-color: #5865f2; }
.combobox__input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: #e0e0e0;
  font-size: 0.9rem;
  font-weight: 500;
}
.combobox__input::placeholder { color: #666; }
.combobox__input:disabled { opacity: 0.6; cursor: default; }
.combobox__hash { color: #555; font-weight: 700; }
.combobox__menu {
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
.combobox__category {
  padding: 0.5rem 0.625rem 0.25rem;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #555;
}
.combobox__option {
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
.combobox__option:hover,
.combobox__option--focused { background: #2b2c30; color: #e0e0e0; }
.combobox__option--active { color: #9da8f0; background: #5865f210; }
.combobox__empty { padding: 0.5rem 0.625rem; color: #555; font-size: 0.875rem; }
.combobox__empty--error { color: #f04747; }
</style>
