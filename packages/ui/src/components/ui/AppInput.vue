<script setup lang="ts">
defineProps<{
  label: string;
  modelValue: string;
  placeholder?: string;
  error?: string | null;
  type?: string;
}>();

defineEmits<{ "update:modelValue": [value: string] }>();
</script>

<template>
  <div class="field">
    <label class="field__label">{{ label }}</label>
    <input
      :value="modelValue"
      :type="type ?? 'text'"
      :placeholder="placeholder"
      :class="['field__input', { 'field__input--error': error }]"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <span v-if="error" class="field__error">{{ error }}</span>
  </div>
</template>

<style scoped>
.field { display: flex; flex-direction: column; gap: 0.375rem; }
.field__label { font-size: 0.875rem; font-weight: 500; color: #e0e0e0; }
.field__input {
  padding: 0.5rem 0.75rem;
  background: #1e1f22;
  border: 1px solid #3a3b3e;
  border-radius: 6px;
  color: #e0e0e0;
  font-size: 0.875rem;
}
.field__input:focus { outline: none; border-color: #5865f2; }
.field__input--error { border-color: #ed4245; }
.field__error { font-size: 0.75rem; color: #ed4245; }
</style>
