<script setup lang="ts">
import { ref, watch } from "vue";
import AppShell from "../../components/layout/AppShell.vue";
import AppButton from "../../components/ui/AppButton.vue";
import ConfirmDialog from "../../components/ui/ConfirmDialog.vue";
import EmptyState from "../../components/ui/EmptyState.vue";
import { useAuthStore } from "../../stores/auth.js";
import { useMemoryStore } from "../../stores/memory.js";

const auth = useAuthStore();
const store = useMemoryStore();

const selectedGuild = ref("");
const newContent = ref("");
const adding = ref(false);

// Inline edit state
const editingId = ref<number | null>(null);
const editContent = ref("");

// Delete confirm state
const deletingId = ref<number | null>(null);
const deleting = ref(false);

watch(selectedGuild, (guildId) => {
  if (guildId) store.fetchMemories(guildId);
});

async function addMemory() {
  if (!selectedGuild.value || !newContent.value.trim()) return;
  adding.value = true;
  try {
    await store.create(selectedGuild.value, null, newContent.value.trim());
    newContent.value = "";
  } finally {
    adding.value = false;
  }
}

function startEdit(id: number, content: string) {
  editingId.value = id;
  editContent.value = content;
}

function cancelEdit() {
  editingId.value = null;
  editContent.value = "";
}

async function saveEdit(memoryId: number) {
  if (!editContent.value.trim()) return;
  await store.update(selectedGuild.value, memoryId, editContent.value.trim());
  cancelEdit();
}

async function confirmDelete() {
  if (deletingId.value === null) return;
  deleting.value = true;
  try {
    await store.remove(selectedGuild.value, deletingId.value);
  } finally {
    deletingId.value = null;
    deleting.value = false;
  }
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
</script>

<template>
  <AppShell>
    <h1 class="page-title">Self Memories</h1>
    <p class="page-desc">Quinn's own observations and opinions per server.</p>

    <div class="field">
      <label class="field__label">Server</label>
      <select v-model="selectedGuild" class="field__select">
        <option value="" disabled>Select a server</option>
        <option v-for="g in auth.adminGuilds" :key="g.id" :value="g.id">{{ g.name }}</option>
      </select>
    </div>

    <template v-if="selectedGuild">
      <form class="add-form" @submit.prevent="addMemory">
        <textarea
          v-model="newContent"
          class="add-form__textarea"
          placeholder="Add a new memory..."
          rows="2"
        />
        <AppButton type="submit" :loading="adding" :disabled="!newContent.trim()">Add</AppButton>
      </form>

      <div v-if="store.status === 'loading'" class="loading">Loading...</div>

      <div v-else-if="store.status === 'error'" class="error">Failed to load memories{{ store.errorMessage ? `: ${store.errorMessage}` : '' }}</div>

      <EmptyState v-else-if="store.memories.length === 0" message="No self memories for this server yet." />

      <div v-else class="memory-list">
        <div v-for="m in store.memories" :key="m.id" class="memory-row">
          <template v-if="editingId === m.id">
            <textarea v-model="editContent" class="memory-row__edit" rows="2" />
            <div class="memory-row__actions">
              <AppButton variant="primary" @click="saveEdit(m.id)">Save</AppButton>
              <AppButton variant="ghost" @click="cancelEdit">Cancel</AppButton>
            </div>
          </template>
          <template v-else>
            <p class="memory-row__content">{{ m.content }}</p>
            <span class="memory-row__date">{{ formatDate(m.createdAt) }}</span>
            <div class="memory-row__actions">
              <button class="icon-btn" title="Edit" @click="startEdit(m.id, m.content)">&#9998;</button>
              <button class="icon-btn icon-btn--danger" title="Delete" @click="deletingId = m.id">&#10005;</button>
            </div>
          </template>
        </div>
      </div>
    </template>

    <ConfirmDialog
      v-if="deletingId !== null"
      title="Delete Memory"
      message="Are you sure you want to delete this memory? This cannot be undone."
      confirm-label="Delete"
      @confirm="confirmDelete"
      @cancel="deletingId = null"
    />
  </AppShell>
</template>

<style scoped>
.page-title { margin: 0; font-size: 1.5rem; font-weight: 700; color: #fff; }
.page-desc { margin: 0 0 1.5rem; font-size: 0.875rem; color: #888; max-width: 600px; }
.field { display: flex; flex-direction: column; gap: 0.375rem; margin-bottom: 1.5rem; max-width: 320px; }
.field__label { font-size: 0.875rem; font-weight: 500; color: #e0e0e0; }
.field__select {
  padding: 0.5rem 0.75rem; background: #1e1f22; border: 1px solid #3a3b3e;
  border-radius: 6px; color: #e0e0e0; font-size: 0.875rem;
}
.field__select:focus { outline: none; border-color: #5865f2; }

.add-form { display: flex; gap: 0.75rem; align-items: flex-start; margin-bottom: 1.5rem; max-width: 700px; }
.add-form__textarea {
  flex: 1; padding: 0.5rem 0.75rem; background: #1e1f22; border: 1px solid #3a3b3e;
  border-radius: 6px; color: #e0e0e0; font-size: 0.875rem; resize: vertical; font-family: inherit;
}
.add-form__textarea:focus { outline: none; border-color: #5865f2; }

.loading { color: #888; font-size: 0.875rem; padding: 1rem 0; }
.error { color: #ed4245; font-size: 0.875rem; padding: 1rem 0; }

.memory-list { display: flex; flex-direction: column; gap: 0.5rem; max-width: 700px; }
.memory-row {
  display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.75rem 1rem;
  background: #111214; border: 1px solid #2b2c30; border-radius: 8px;
}
.memory-row__content { flex: 1; margin: 0; font-size: 0.875rem; color: #e0e0e0; white-space: pre-wrap; }
.memory-row__date { font-size: 0.75rem; color: #666; white-space: nowrap; padding-top: 0.125rem; }
.memory-row__edit {
  flex: 1; padding: 0.5rem 0.75rem; background: #1e1f22; border: 1px solid #5865f2;
  border-radius: 6px; color: #e0e0e0; font-size: 0.875rem; resize: vertical; font-family: inherit;
}
.memory-row__actions { display: flex; gap: 0.5rem; align-items: center; }

.icon-btn {
  background: none; border: none; color: #888; cursor: pointer; font-size: 0.9rem;
  padding: 0.25rem; border-radius: 4px; transition: color 0.15s, background 0.15s;
}
.icon-btn:hover { color: #e0e0e0; background: #3a3b3e; }
.icon-btn--danger:hover { color: #ed4245; background: #ed424510; }
</style>
