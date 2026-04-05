<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRoute } from "vue-router";
import AppShell from "../../components/layout/AppShell.vue";
import AppTextarea from "../../components/ui/AppTextarea.vue";
import AppButton from "../../components/ui/AppButton.vue";
import StatusBadge from "../../components/ui/StatusBadge.vue";
import ConfirmDialog from "../../components/ui/ConfirmDialog.vue";
import { useGuildUsersStore } from "../../stores/guildUsers.js";
import { useCurrentGuild } from "../../composables/useCurrentGuild.js";
import { useSaveState } from "../../composables/useSaveState.js";

const store = useGuildUsersStore();
const { guildId } = useCurrentGuild();
const route = useRoute();
const { status, errorMessage, save } = useSaveState();

const userId = route.params.userId as string;
const draft = ref("");
const showDeleteConfirm = ref(false);

const isBanned = () =>
  (store.forbiddenUsers.get(guildId.value) ?? []).some((u) => u.discordUserId === userId);

onMounted(async () => {
  await Promise.all([
    store.fetchForbidden(guildId.value),
    store.fetchAdminContext(guildId.value, userId),
    store.fetchContextMuted(guildId.value, userId),
    store.fetchDisplayName(guildId.value, userId),
  ]);
  draft.value = store.getAdminContext(guildId.value, userId)?.context ?? "";
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
</style>
