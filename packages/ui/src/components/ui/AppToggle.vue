<script setup lang="ts">
/**
 * Three-state toggle: true | false | null
 * null means "inherit from server default" — used for channel-level config fields.
 */
const props = defineProps<{
  label: string;
  modelValue: boolean | null;
  nullable?: boolean;
  hint?: string;
}>();

const emit = defineEmits<{ "update:modelValue": [value: boolean | null] }>();

function toggle() {
  if (props.nullable) {
    // Cycle: null → true → false → null
    if (props.modelValue === null) emit("update:modelValue", true);
    else if (props.modelValue === true) emit("update:modelValue", false);
    else emit("update:modelValue", null);
  } else {
    emit("update:modelValue", !props.modelValue);
  }
}

function statusText(): string {
  if (props.modelValue === null) return "Server default";
  return props.modelValue ? "On" : "Off";
}
</script>

<template>
  <div class="toggle-row">
    <div class="toggle-row__text">
      <span class="toggle-row__label">{{ label }}</span>
      <span v-if="hint" class="toggle-row__hint">{{ hint }}</span>
    </div>
    <button
      type="button"
      :class="['toggle', modelValue === true && 'toggle--on', modelValue === null && 'toggle--inherit']"
      :aria-pressed="modelValue ?? false"
      @click="toggle"
    >
      <span class="toggle__thumb" />
      <span class="toggle__label">{{ statusText() }}</span>
    </button>
  </div>
</template>

<style scoped>
.toggle-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.75rem 0; border-bottom: 1px solid #2b2c30; }
.toggle-row__text { display: flex; flex-direction: column; gap: 0.25rem; }
.toggle-row__label { font-size: 0.875rem; font-weight: 500; color: #e0e0e0; }
.toggle-row__hint { font-size: 0.75rem; color: #888; }
.toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.75rem 0.25rem 0.25rem;
  background: #3a3b3e;
  border: none;
  border-radius: 20px;
  cursor: pointer;
  transition: background 0.2s;
  flex-shrink: 0;
}
.toggle--on { background: #5865f2; }
.toggle--inherit { background: #4a4b50; }
.toggle__thumb {
  width: 18px;
  height: 18px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s;
}
.toggle--on .toggle__thumb { transform: none; }
.toggle__label { font-size: 0.75rem; color: #fff; white-space: nowrap; }
</style>
