<script setup lang="ts">
const props = defineProps<{
  label: string;
  modelValue: string;
  maxLength?: number;
  rows?: number;
  hint?: string;
}>();

defineEmits<{ "update:modelValue": [value: string] }>();
</script>

<template>
  <div class="field">
    <label class="field__label">{{ label }}</label>
    <textarea
      :value="modelValue"
      :rows="rows ?? 6"
      :maxlength="maxLength"
      class="field__textarea"
      @input="$emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    />
    <div class="field__footer">
      <span class="field__hint">{{ hint }}</span>
      <span v-if="maxLength" class="field__count">{{ modelValue.length }} / {{ maxLength }}</span>
    </div>
  </div>
</template>

<style scoped>
.field { display: flex; flex-direction: column; gap: 0.375rem; }
.field__label { font-size: 0.875rem; font-weight: 500; color: #e0e0e0; }
.field__textarea {
  width: 100%;
  padding: 0.625rem 0.75rem;
  background: #1e1f22;
  border: 1px solid #3a3b3e;
  border-radius: 6px;
  color: #e0e0e0;
  font-size: 0.875rem;
  font-family: inherit;
  resize: vertical;
  box-sizing: border-box;
}
.field__textarea:focus { outline: none; border-color: #5865f2; }
.field__footer { display: flex; justify-content: space-between; }
.field__hint { font-size: 0.75rem; color: #888; }
.field__count { font-size: 0.75rem; color: #888; }
</style>
