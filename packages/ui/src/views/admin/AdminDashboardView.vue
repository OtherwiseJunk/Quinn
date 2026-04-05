<script setup lang="ts">
import AppShell from "../../components/layout/AppShell.vue";
</script>

<template>
  <AppShell>
    <h1 class="page-title">Administration</h1>
    <p class="page-desc">Bot-wide settings and monitoring.</p>
    <div class="cards">
      <RouterLink to="/admin/system-prompt" class="card">
        <h3>System Prompt</h3>
        <p>Edit the global system prompt that defines Quinn's core personality.</p>
      </RouterLink>
      <RouterLink to="/admin/usage" class="card">
        <h3>API Usage</h3>
        <p>View raw and charged costs across all servers with per-server breakdown.</p>
      </RouterLink>
      <RouterLink to="/admin/memories/self" class="card">
        <h3>Self Memories</h3>
        <p>Browse and manage Quinn's own observations and opinions per server.</p>
      </RouterLink>
      <RouterLink to="/admin/memories/users" class="card">
        <h3>User Memories</h3>
        <p>Browse and manage Quinn's memories about specific users per server.</p>
      </RouterLink>
    </div>
  </AppShell>
</template>

<style scoped>
.page-title { margin: 0; font-size: 1.5rem; font-weight: 700; color: #fff; }
.page-desc { margin: 0 0 1.5rem; font-size: 0.875rem; color: #888; max-width: 600px; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 1rem; }
.card { display: flex; flex-direction: column; gap: 0.5rem; padding: 1.25rem; background: #111214; border: 1px solid #5865f240; border-radius: 10px; text-decoration: none; color: inherit; transition: border-color 0.15s; }
.card:hover { border-color: #5865f2; }
.card h3 { margin: 0; font-size: 0.95rem; color: #fff; }
.card p { margin: 0; font-size: 0.8rem; color: #888; }
</style>
