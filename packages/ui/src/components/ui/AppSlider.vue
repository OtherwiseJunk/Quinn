<script setup lang="ts">
defineProps<{
  label: string;
  modelValue: number;
  min?: number;
  max?: number;
  hint?: string;
}>();

defineEmits<{ "update:modelValue": [value: number] }>();
</script>

<template>
  <div class="slider-row">
    <div class="slider-row__header">
      <span class="slider-row__label">{{ label }}</span>
      <span class="slider-row__value">{{ modelValue }}%</span>
    </div>
    <input
      type="range"
      :min="min ?? 0"
      :max="max ?? 100"
      :value="modelValue"
      class="slider"
      @input="$emit('update:modelValue', Number(($event.target as HTMLInputElement).value))"
    />
    <span v-if="hint" class="slider-row__hint">{{ hint }}</span>
  </div>
</template>

<style scoped>
.slider-row { display: flex; flex-direction: column; gap: 0.5rem; padding: 0.75rem 0; border-bottom: 1px solid #2b2c30; }
.slider-row__header { display: flex; justify-content: space-between; }
.slider-row__label { font-size: 0.875rem; font-weight: 500; color: #e0e0e0; }
.slider-row__value { font-size: 0.875rem; color: #5865f2; font-weight: 600; }
.slider-row__hint { font-size: 0.75rem; color: #888; }
.slider { width: 100%; accent-color: #5865f2; }
</style>
