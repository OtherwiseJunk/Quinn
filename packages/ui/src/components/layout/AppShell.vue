<script setup lang="ts">
import SidebarNav from "./SidebarNav.vue";
import UserBadge from "./UserBadge.vue";
</script>

<template>
  <div class="shell">
    <aside class="shell__sidebar">
      <div class="shell__brand">Quinn</div>
      <SidebarNav />
      <UserBadge />
    </aside>
    <main class="shell__main">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.shell { display: flex; height: 100vh; background: #1a1b1e; color: #e0e0e0; font-family: system-ui, sans-serif; }
.shell__sidebar { width: 220px; flex-shrink: 0; background: #111214; border-right: 1px solid #2b2c30; display: flex; flex-direction: column; }
.shell__brand { padding: 1.25rem 1.25rem 0.75rem; font-size: 1.1rem; font-weight: 700; color: #fff; letter-spacing: -0.01em; }
.shell__main { flex: 1; overflow-y: auto; padding: 2rem; }
</style>
