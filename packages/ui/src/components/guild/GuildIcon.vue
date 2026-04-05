<script setup lang="ts">
import type { AdminGuild } from "@quinn/shared";

const props = defineProps<{ guild: AdminGuild; size?: number }>();

function iconUrl(guild: AdminGuild) {
  if (!guild.icon) return null;
  return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64`;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
</script>

<template>
  <div
    class="guild-icon"
    :style="{ width: `${size ?? 32}px`, height: `${size ?? 32}px`, fontSize: `${(size ?? 32) * 0.4}px` }"
  >
    <img v-if="iconUrl(guild)" :src="iconUrl(guild)!" :alt="guild.name" class="guild-icon__img" />
    <span v-else class="guild-icon__initials">{{ initials(guild.name) }}</span>
  </div>
</template>

<style scoped>
.guild-icon {
  border-radius: 50%;
  background: #3a3b3e;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.guild-icon__img { width: 100%; height: 100%; object-fit: cover; }
.guild-icon__initials { color: #e0e0e0; font-weight: 700; line-height: 1; }
</style>
