<script setup lang="ts">
import { ref } from "vue";

defineProps<{
  label: string;
  modelValue: string[];
  hint?: string;
}>();

const emit = defineEmits<{ "update:modelValue": [value: string[]] }>();

const input = ref("");

function add(tags: string[], newTag: string) {
  const trimmed = newTag.trim().toLowerCase();
  if (trimmed && !tags.includes(trimmed)) {
    emit("update:modelValue", [...tags, trimmed]);
  }
  input.value = "";
}

function remove(tags: string[], tag: string) {
  emit("update:modelValue", tags.filter((t) => t !== tag));
}

function onKeydown(e: KeyboardEvent, tags: string[]) {
  if (e.key === "Enter" || e.key === ",") {
    e.preventDefault();
    add(tags, input.value);
  } else if (e.key === "Backspace" && input.value === "" && tags.length > 0) {
    emit("update:modelValue", tags.slice(0, -1));
  }
}
</script>

<template>
  <div class="tag-field">
    <label class="tag-field__label">{{ label }}</label>
    <div class="tag-field__box">
      <span v-for="tag in modelValue" :key="tag" class="tag">
        {{ tag }}
        <button type="button" class="tag__remove" @click="remove(modelValue, tag)">×</button>
      </span>
      <input
        v-model="input"
        class="tag-field__input"
        placeholder="Type and press Enter..."
        @keydown="onKeydown($event, modelValue)"
        @blur="add(modelValue, input)"
      />
    </div>
    <span v-if="hint" class="tag-field__hint">{{ hint }}</span>
  </div>
</template>

<style scoped>
.tag-field { display: flex; flex-direction: column; gap: 0.375rem; }
.tag-field__label { font-size: 0.875rem; font-weight: 500; color: #e0e0e0; }
.tag-field__box {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  padding: 0.5rem;
  background: #1e1f22;
  border: 1px solid #3a3b3e;
  border-radius: 6px;
  min-height: 42px;
}
.tag-field__box:focus-within { border-color: #5865f2; }
.tag {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.5rem;
  background: #5865f220;
  color: #9da8f0;
  border-radius: 4px;
  font-size: 0.8rem;
}
.tag__remove { background: none; border: none; color: inherit; cursor: pointer; font-size: 1rem; line-height: 1; padding: 0; }
.tag__remove:hover { color: #ed4245; }
.tag-field__input { flex: 1; min-width: 120px; background: none; border: none; outline: none; color: #e0e0e0; font-size: 0.875rem; }
.tag-field__hint { font-size: 0.75rem; color: #888; }
</style>
