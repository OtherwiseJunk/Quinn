<script setup lang="ts">
import { ref, onMounted } from "vue";
import AppShell from "../../components/layout/AppShell.vue";
import AppTextarea from "../../components/ui/AppTextarea.vue";
import AppButton from "../../components/ui/AppButton.vue";
import AppTagInput from "../../components/ui/AppTagInput.vue";
import StatusBadge from "../../components/ui/StatusBadge.vue";
import { useSystemPromptStore } from "../../stores/systemPrompt.js";
import { useSaveState } from "../../composables/useSaveState.js";

const store = useSystemPromptStore();
const { status, errorMessage, save } = useSaveState();
const { status: wordsStatus, errorMessage: wordsError, save: saveWords } = useSaveState();
const { status: limitSaveStatus, errorMessage: limitError, save: saveLimit } = useSaveState();
const draft = ref("");
const wordsDraft = ref<string[]>([]);
const limitDraft = ref(25);

onMounted(async () => {
  await Promise.all([store.fetch(), store.fetchWords(), store.fetchLimit()]);
  draft.value = store.prompt ?? "";
  wordsDraft.value = [...store.globalForbiddenWords];
  limitDraft.value = store.contextMessageLimit;
});

async function submit() {
  await save(() => store.save(draft.value));
}

async function submitWords() {
  await saveWords(() => store.saveWords(wordsDraft.value));
}

async function submitLimit() {
  await saveLimit(() => store.saveLimit(limitDraft.value));
}
</script>

<template>
  <AppShell>
    <div class="page-header">
      <h1 class="page-title">System Prompt</h1>
      <StatusBadge :status="status" :error="errorMessage" />
    </div>
    <p class="page-desc">
      This is the foundational prompt sent to Groq on every request. It defines Quinn's core
      personality and cannot be overridden by server admins.
    </p>
    <form class="form" @submit.prevent="submit">
      <AppTextarea v-model="draft" label="System prompt" :rows="16" />
      <AppButton type="submit" :loading="status === 'saving'">Save</AppButton>
    </form>

    <div class="section-divider" />

    <div class="page-header">
      <h1 class="page-title">Global Forbidden Words</h1>
      <StatusBadge :status="wordsStatus" :error="wordsError" />
    </div>
    <p class="page-desc">
      Words listed here are blocked across all servers. They are merged with each server's and
      channel's own forbidden word lists.
    </p>
    <form class="form" @submit.prevent="submitWords">
      <AppTagInput
        v-model="wordsDraft"
        label="Forbidden words"
        hint="Press Enter or comma to add a word. These apply globally to every server."
      />
      <AppButton type="submit" :loading="wordsStatus === 'saving'">Save</AppButton>
    </form>

    <div class="section-divider" />

    <div class="page-header">
      <h1 class="page-title">Context Message Limit</h1>
      <StatusBadge :status="limitSaveStatus" :error="limitError" />
    </div>
    <p class="page-desc">
      How many recent channel messages to include as context when building a Groq request.
      If the triggering message is a reply, the referenced message is always included (even if it
      exceeds this limit by one).
    </p>
    <form class="form" @submit.prevent="submitLimit">
      <div class="field">
        <label class="field__label">Message limit (1–100)</label>
        <input
          v-model.number="limitDraft"
          type="number"
          min="1"
          max="100"
          class="field__input"
        />
      </div>
      <AppButton type="submit" :loading="limitSaveStatus === 'saving'">Save</AppButton>
    </form>
  </AppShell>
</template>

<style scoped>
.page-header { display: flex; align-items: center; gap: 1rem; margin-bottom: 0.5rem; }
.page-title { margin: 0; font-size: 1.5rem; font-weight: 700; color: #fff; }
.page-desc { margin: 0 0 1.5rem; font-size: 0.875rem; color: #888; max-width: 600px; }
.form { display: flex; flex-direction: column; gap: 1rem; max-width: 700px; }
.section-divider { margin: 2.5rem 0; border-top: 1px solid #333; max-width: 700px; }
.field { display: flex; flex-direction: column; gap: 0.375rem; }
.field__label { font-size: 0.875rem; font-weight: 500; color: #e0e0e0; }
.field__input {
  padding: 0.5rem 0.75rem;
  background: #1e1f22;
  border: 1px solid #3a3b3e;
  border-radius: 6px;
  color: #e0e0e0;
  font-size: 0.875rem;
  max-width: 120px;
}
.field__input:focus { outline: none; border-color: #5865f2; }
</style>
