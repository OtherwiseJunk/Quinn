<script setup lang="ts">
import AppShell from "../components/layout/AppShell.vue";
import { useAuthStore } from "../stores/auth.js";
import { useRole } from "../composables/useRole.js";

const auth = useAuthStore();
const { isAtLeast } = useRole();
</script>

<template>
  <AppShell>
    <h1 class="page-title">Welcome back, {{ auth.user?.username }}</h1>
    <div class="cards">
      <RouterLink to="/me/context" class="card">
        <h3>My Context</h3>
        <p>Tell Quinn a bit about yourself so they can reference it in conversations.</p>
      </RouterLink>
      <RouterLink v-if="isAtLeast('server_admin')" to="/guilds" class="card">
        <h3>Server Configurations</h3>
        <p>Manage Quinn's behavior across your {{ auth.adminGuilds.length }} server{{ auth.adminGuilds.length === 1 ? '' : 's' }}.</p>
      </RouterLink>
      <RouterLink v-if="isAtLeast('bot_owner')" to="/admin" class="card card--owner">
        <h3>Administration</h3>
        <p>System prompt, API usage, and other bot-wide settings.</p>
      </RouterLink>
    </div>
  </AppShell>
</template>

<style scoped>
.page-title { margin: 0 0 1.5rem; font-size: 1.5rem; font-weight: 700; color: #fff; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1rem; }
.card { display: flex; flex-direction: column; gap: 0.5rem; padding: 1.25rem; background: #111214; border: 1px solid #2b2c30; border-radius: 10px; text-decoration: none; color: inherit; transition: border-color 0.15s; }
.card:hover { border-color: #5865f2; }
.card h3 { margin: 0; font-size: 0.95rem; color: #fff; }
.card p { margin: 0; font-size: 0.8rem; color: #888; }
.card--owner { border-color: #5865f240; }
.card--owner:hover { border-color: #5865f2; }
</style>
