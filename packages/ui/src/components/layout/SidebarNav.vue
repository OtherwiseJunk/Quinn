<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useAuthStore } from "../../stores/auth.js";
import { useRole } from "../../composables/useRole.js";
import GuildIcon from "../guild/GuildIcon.vue";

const auth = useAuthStore();
const { isAtLeast } = useRole();
const route = useRoute();

const currentGuildId = computed(() => route.params.guildId as string | undefined);
const currentGuild = computed(() =>
  currentGuildId.value
    ? auth.adminGuilds.find((g) => g.id === currentGuildId.value) ?? null
    : null
);
</script>

<template>
  <nav class="nav">
    <div class="nav__section">
      <RouterLink to="/" class="nav__link">Dashboard</RouterLink>
      <RouterLink to="/me/context" class="nav__link">My Context</RouterLink>
    </div>

    <div v-if="isAtLeast('server_admin')" class="nav__section">
      <RouterLink to="/guilds" class="nav__link">Server Configurations</RouterLink>
      <!-- Show sub-nav when inside a specific guild -->
      <template v-if="currentGuildId">
        <div class="nav__guild-header">
          <GuildIcon v-if="currentGuild" :guild="currentGuild" :size="16" />
          <span class="nav__group-label">{{ currentGuild?.name ?? currentGuildId }}</span>
        </div>
        <RouterLink :to="`/guilds/${currentGuildId}/config`" class="nav__link nav__link--child">Server Config</RouterLink>
        <RouterLink :to="`/guilds/${currentGuildId}/channels`" class="nav__link nav__link--child">Channels</RouterLink>
        <RouterLink :to="`/guilds/${currentGuildId}/users`" class="nav__link nav__link--child">Users</RouterLink>
      </template>
    </div>

    <div v-if="isAtLeast('bot_owner')" class="nav__section">
      <RouterLink to="/admin" class="nav__group-label nav__group-link">Administration</RouterLink>
      <RouterLink to="/admin/system-prompt" class="nav__link nav__link--child">
        System Prompt
      </RouterLink>
      <RouterLink to="/admin/usage" class="nav__link nav__link--child">
        API Usage
      </RouterLink>
      <RouterLink to="/admin/memories/self" class="nav__link nav__link--child">
        Self Memories
      </RouterLink>
      <RouterLink to="/admin/memories/users" class="nav__link nav__link--child">
        User Memories
      </RouterLink>
    </div>
  </nav>
</template>

<style scoped>
.nav { display: flex; flex-direction: column; gap: 0.25rem; padding: 1rem 0.75rem; flex: 1; overflow-y: auto; }
.nav__section { display: flex; flex-direction: column; gap: 0.125rem; padding-bottom: 0.75rem; border-bottom: 1px solid #2b2c30; margin-bottom: 0.5rem; }
.nav__section:last-child { border-bottom: none; }
.nav__guild-header { display: flex; align-items: center; gap: 0.5rem; padding: 0.25rem 0.5rem; }
.nav__group-label { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #666; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nav__group-link { text-decoration: none; padding: 0.25rem 0.5rem; border-radius: 5px; transition: color 0.15s; }
.nav__group-link:hover { color: #999; }
.nav__link { padding: 0.4rem 0.5rem; border-radius: 5px; color: #b0b0b0; font-size: 0.875rem; text-decoration: none; transition: background 0.15s, color 0.15s; }
.nav__link:hover { background: #3a3b3e; color: #e0e0e0; }
.nav__link.router-link-active { background: #5865f220; color: #9da8f0; }
.nav__link--child { padding-left: 1rem; }
</style>
