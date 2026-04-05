<script setup lang="ts">
defineProps<{ message: string }>();
</script>

<template>
  <div class="empty">
    <p class="empty__message">{{ message }}</p>
    <slot />
  </div>
</template>

<style scoped>
.empty { display: flex; flex-direction: column; align-items: center; gap: 1rem; padding: 3rem 1rem; color: #888; text-align: center; }
.empty__message { font-size: 0.9rem; margin: 0; }
</style>
