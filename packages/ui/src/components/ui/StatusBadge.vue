<script setup lang="ts">
defineProps<{ status: "idle" | "saving" | "saved" | "error"; error?: string | null }>();
</script>

<template>
  <span v-if="status !== 'idle'" :class="['badge', `badge--${status}`]">
    <span v-if="status === 'saving'">Saving...</span>
    <span v-else-if="status === 'saved'">Saved</span>
    <span v-else-if="status === 'error'">{{ error ?? "Error" }}</span>
  </span>
</template>

<style scoped>
.badge { font-size: 0.8rem; padding: 0.25rem 0.625rem; border-radius: 4px; }
.badge--saving { background: #4a4b50; color: #ccc; }
.badge--saved { background: #23a55a20; color: #23a55a; }
.badge--error { background: #ed424520; color: #ed4245; }
</style>
