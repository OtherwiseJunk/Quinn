<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import type { AdminGuild } from "@quinn/shared";
import GuildIcon from "./GuildIcon.vue";

const props = defineProps<{
  guilds: AdminGuild[];
  currentGuildId: string;
  targetRoute: (guildId: string) => string;
}>();

const router = useRouter();
const open = ref(false);

const currentGuild = computed(
  () => props.guilds.find((g) => g.id === props.currentGuildId) ?? null
);

function select(guildId: string) {
  open.value = false;
  if (guildId !== props.currentGuildId) {
    router.push(props.targetRoute(guildId));
  }
}
</script>

<template>
  <div class="selector" v-click-outside="() => (open = false)">
    <button type="button" class="selector__trigger" @click="open = !open">
      <GuildIcon v-if="currentGuild" :guild="currentGuild" :size="24" />
      <span class="selector__name">{{ currentGuild?.name ?? currentGuildId }}</span>
      <span class="selector__caret">{{ open ? '▲' : '▼' }}</span>
    </button>
    <div v-if="open" class="selector__menu">
      <button
        v-for="guild in guilds"
        :key="guild.id"
        type="button"
        :class="['selector__option', guild.id === currentGuildId && 'selector__option--active']"
        @click="select(guild.id)"
      >
        <GuildIcon :guild="guild" :size="20" />
        <span>{{ guild.name }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.selector { position: relative; display: inline-block; }
.selector__trigger {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.5rem 0.75rem;
  background: #1e1f22;
  border: 1px solid #3a3b3e;
  border-radius: 8px;
  color: #e0e0e0;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: border-color 0.15s;
  min-width: 200px;
}
.selector__trigger:hover { border-color: #5865f2; }
.selector__name { flex: 1; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
.selector__option {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.5rem 0.625rem;
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
</style>
