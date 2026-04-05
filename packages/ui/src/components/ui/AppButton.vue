<script setup lang="ts">
defineProps<{
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "danger" | "ghost";
  type?: "button" | "submit";
}>();
</script>

<template>
  <button
    :type="type ?? 'button'"
    :disabled="disabled || loading"
    :class="['btn', `btn--${variant ?? 'primary'}`, { 'btn--loading': loading }]"
  >
    <span v-if="loading" class="btn__spinner" aria-hidden="true" />
    <slot />
  </button>
</template>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s, background 0.15s;
}
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn--primary { background: #5865f2; color: #fff; }
.btn--primary:not(:disabled):hover { background: #4752c4; }
.btn--danger { background: #ed4245; color: #fff; }
.btn--danger:not(:disabled):hover { background: #c03537; }
.btn--ghost { background: transparent; color: #5865f2; border: 1px solid #5865f2; }
.btn--ghost:not(:disabled):hover { background: #5865f210; }
.btn__spinner {
  width: 0.875rem;
  height: 0.875rem;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
