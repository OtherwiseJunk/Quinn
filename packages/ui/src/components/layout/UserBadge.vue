<script setup lang="ts">
import { useAuthStore } from "../../stores/auth.js";

const auth = useAuthStore();
</script>

<template>
  <div v-if="auth.user" class="user-badge">
    <img
      v-if="auth.user.avatar"
      :src="`https://cdn.discordapp.com/avatars/${auth.user.discordUserId}/${auth.user.avatar}.png?size=32`"
      class="user-badge__avatar"
      alt=""
    />
    <div v-else class="user-badge__avatar user-badge__avatar--placeholder" />
    <span class="user-badge__name">{{ auth.user.username }}</span>
    <button class="user-badge__logout" @click="auth.logout()">Sign out</button>
  </div>
</template>

<style scoped>
.user-badge { display: flex; align-items: center; gap: 0.625rem; padding: 0.75rem; border-top: 1px solid #2b2c30; }
.user-badge__avatar { width: 32px; height: 32px; border-radius: 50%; background: #3a3b3e; flex-shrink: 0; }
.user-badge__name { flex: 1; font-size: 0.875rem; color: #e0e0e0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.user-badge__logout { background: none; border: none; color: #888; font-size: 0.75rem; cursor: pointer; white-space: nowrap; }
.user-badge__logout:hover { color: #ed4245; }
</style>
