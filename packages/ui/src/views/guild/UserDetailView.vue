<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRoute } from "vue-router";
import AppShell from "../../components/layout/AppShell.vue";
import AppTextarea from "../../components/ui/AppTextarea.vue";
import AppButton from "../../components/ui/AppButton.vue";
import AppToggle from "../../components/ui/AppToggle.vue";
import StatusBadge from "../../components/ui/StatusBadge.vue";
import ConfirmDialog from "../../components/ui/ConfirmDialog.vue";
import { useGuildUsersStore } from "../../stores/guildUsers.js";
import { useCurrentGuild } from "../../composables/useCurrentGuild.js";
import { useSaveState } from "../../composables/useSaveState.js";

const store = useGuildUsersStore();
const { guildId } = useCurrentGuild();
const route = useRoute();
const { status, errorMessage, save } = useSaveState();
const { status: timeoutSaveStatus, errorMessage: timeoutSaveError, save: saveTimeout } = useSaveState();

const userId = route.params.userId as string;
const draft = ref("");
const showDeleteConfirm = ref(false);

const timeoutActive = ref(false);
const disciplineLevel = ref<0 | 1 | 2 | 3>(0);
const timeoutExpiresAt = ref<string | null>(null);

const isBanned = () =>
  (store.forbiddenUsers.get(guildId.value) ?? []).some((u) => u.discordUserId === userId);

onMounted(async () => {
  await Promise.all([
    store.fetchForbidden(guildId.value),
    store.fetchAdminContext(guildId.value, userId),
    store.fetchContextMuted(guildId.value, userId),
    store.fetchDisplayName(guildId.value, userId),
    store.fetchTimeoutStatus(guildId.value, userId),
  ]);
  draft.value = store.getAdminContext(guildId.value, userId)?.context ?? "";
  const ts = store.getTimeoutStatus(guildId.value, userId);
  if (ts) {
    timeoutActive.value = ts.isTimedOut;
    disciplineLevel.value = (ts.level ?? 0) as 0 | 1 | 2 | 3;
    timeoutExpiresAt.value = ts.expiresAt;
  }
});

const displayName = () => store.getDisplayName(guildId.value, userId);

async function submit() {
  await save(() => store.saveAdminContext(guildId.value, userId, draft.value));
}

async function deleteContext() {
  await store.deleteAdminContext(guildId.value, userId);
  draft.value = "";
  showDeleteConfirm.value = false;
}

async function toggleBan() {
  if (isBanned()) await store.unbanUser(guildId.value, userId);
  else await store.banUser(guildId.value, userId);
}

async function toggleContextMute() {
  const current = store.isContextMuted(guildId.value, userId);
  await store.setContextMuted(guildId.value, userId, !current);
}

async function applyTimeout() {
  await saveTimeout(() =>
    store.saveTimeoutStatus(guildId.value, userId, timeoutActive.value, disciplineLevel.value)
  );
  const ts = store.getTimeoutStatus(guildId.value, userId);
  if (ts) timeoutExpiresAt.value = ts.expiresAt;
}
</script>

<template>
  <AppShell>
    <div class="page-header">
      <div>
        <h1 class="page-title">{{ displayName() ?? userId }} <span v-if="displayName()" class="page-title__id">({{ userId }})</span></h1>
        <span :class="['ban-badge', isBanned() && 'ban-badge--active']">
          {{ isBanned() ? "Banned" : "Not banned" }}
        </span>
      </div>
      <StatusBadge :status="status" :error="errorMessage" />
    </div>

    <div class="actions-row">
      <AppButton :variant="isBanned() ? 'ghost' : 'danger'" @click="toggleBan">
        {{ isBanned() ? "Unban User" : "Ban User" }}
      </AppButton>
      <AppButton :variant="store.isContextMuted(guildId, userId) ? 'ghost' : 'danger'" @click="toggleContextMute">
        {{ store.isContextMuted(guildId, userId) ? "Unmute Context" : "Mute Context" }}
      </AppButton>
    </div>
    <p v-if="store.isContextMuted(guildId, userId)" class="mute-hint">
      This user's self-provided context is silently ignored in this server.
    </p>

    <form class="form" @submit.prevent="submit">
      <AppTextarea
        v-model="draft"
        label="Admin notes"
        :rows="8"
        hint="Visible to Quinn during conversations in this server. Not shown to the user."
      />
      <div class="form-actions">
        <AppButton type="submit" :loading="status === 'saving'">Save Notes</AppButton>
        <AppButton v-if="draft" variant="ghost" @click="showDeleteConfirm = true">Clear Notes</AppButton>
      </div>
    </form>

    <div class="timeout-section">
      <h2 class="timeout-section__title">Timeout &amp; Discipline</h2>
      <AppToggle
        v-model="timeoutActive"
        label="Timed out"
        :hint="timeoutExpiresAt ? `Expires ${new Date(timeoutExpiresAt).toLocaleString()}` : undefined"
      />
      <div class="discipline-row">
        <label class="discipline-row__label" for="discipline-level">Discipline level</label>
        <select id="discipline-level" v-model.number="disciplineLevel" class="discipline-select">
          <option :value="0">0 — None</option>
          <option :value="1">1 — Level 1 (1h)</option>
          <option :value="2">2 — Level 2 (4h)</option>
          <option :value="3">3 — Level 3 (8h)</option>
        </select>
      </div>
      <div class="timeout-actions">
        <AppButton @click="applyTimeout" :loading="timeoutSaveStatus === 'saving'">Apply</AppButton>
        <StatusBadge :status="timeoutSaveStatus" :error="timeoutSaveError" />
      </div>
    </div>

    <ConfirmDialog
      v-if="showDeleteConfirm"
      title="Clear admin notes?"
      message="This will permanently remove all admin notes for this user in this server."
      confirm-label="Clear"
      @confirm="deleteContext"
      @cancel="showDeleteConfirm = false"
    />
  </AppShell>
</template>

<style scoped>
.page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 1rem; }
.page-title { margin: 0 0 0.375rem; font-size: 1.5rem; font-weight: 700; color: #fff; }
.page-title__id { font-size: 0.875rem; font-weight: 400; color: #666; font-family: monospace; }
.ban-badge { font-size: 0.75rem; padding: 0.125rem 0.5rem; border-radius: 4px; background: #3a3b3e; color: #888; }
.ban-badge--active { background: #ed424520; color: #ed4245; }
.actions-row { display: flex; gap: 0.75rem; margin-bottom: 1rem; }
.mute-hint { margin: 0 0 1.5rem; font-size: 0.8rem; color: #ed4245; }
.form { display: flex; flex-direction: column; gap: 1rem; max-width: 600px; }
.form-actions { display: flex; gap: 0.75rem; }
.timeout-section { max-width: 600px; margin-top: 1.5rem; display: flex; flex-direction: column; gap: 0; background: #111214; border: 1px solid #2b2c30; border-radius: 10px; padding: 1rem 1.25rem; }
.timeout-section__title { margin: 0 0 0.75rem; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #666; }
.discipline-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.75rem 0; border-bottom: 1px solid #2b2c30; }
.discipline-row__label { font-size: 0.875rem; font-weight: 500; color: #e0e0e0; }
.discipline-select { background: #1e1f22; border: 1px solid #3a3b3e; border-radius: 6px; color: #e0e0e0; font-size: 0.875rem; padding: 0.25rem 0.5rem; cursor: pointer; }
.timeout-actions { display: flex; align-items: center; gap: 0.75rem; padding-top: 0.75rem; }
</style>
