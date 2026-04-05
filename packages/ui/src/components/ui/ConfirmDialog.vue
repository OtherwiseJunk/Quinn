<script setup lang="ts">
defineProps<{ title: string; message: string; confirmLabel?: string }>();
defineEmits<{ confirm: []; cancel: [] }>();
</script>

<template>
  <div class="overlay" @click.self="$emit('cancel')">
    <div class="dialog">
      <h3 class="dialog__title">{{ title }}</h3>
      <p class="dialog__message">{{ message }}</p>
      <div class="dialog__actions">
        <button type="button" class="btn btn--ghost" @click="$emit('cancel')">Cancel</button>
        <button type="button" class="btn btn--danger" @click="$emit('confirm')">
          {{ confirmLabel ?? "Confirm" }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed; inset: 0;
  background: #00000080;
  display: flex; align-items: center; justify-content: center;
  z-index: 100;
}
.dialog {
  background: #2b2c30;
  border: 1px solid #3a3b3e;
  border-radius: 10px;
  padding: 1.5rem;
  max-width: 400px;
  width: 100%;
}
.dialog__title { margin: 0 0 0.5rem; font-size: 1rem; color: #e0e0e0; }
.dialog__message { margin: 0 0 1.25rem; font-size: 0.875rem; color: #aaa; }
.dialog__actions { display: flex; justify-content: flex-end; gap: 0.75rem; }
.btn { padding: 0.5rem 1rem; border-radius: 6px; font-size: 0.875rem; font-weight: 500; cursor: pointer; border: none; }
.btn--ghost { background: transparent; border: 1px solid #5865f2; color: #5865f2; }
.btn--danger { background: #ed4245; color: #fff; }
</style>
