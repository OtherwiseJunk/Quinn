<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import AppShell from "../../components/layout/AppShell.vue";
import AppInput from "../../components/ui/AppInput.vue";
import AppButton from "../../components/ui/AppButton.vue";
import ConfirmDialog from "../../components/ui/ConfirmDialog.vue";
import EmptyState from "../../components/ui/EmptyState.vue";
import { useGuildUsersStore } from "../../stores/guildUsers.js";
import { useCurrentGuild } from "../../composables/useCurrentGuild.js";

const store = useGuildUsersStore();
const { guildId } = useCurrentGuild();
const router = useRouter();

const lookupInput = ref("");
const banInput = ref("");
const banError = ref<string | null>(null);
const unbanTarget = ref<string | null>(null);

onMounted(() => {
  store.fetchForbidden(guildId.value);
  store.fetchConfiguredUsers(guildId.value);
});

function lookup() {
  const id = lookupInput.value.trim();
  if (!id) return;
  router.push({ name: "user-detail", params: { guildId: guildId.value, userId: id } });
}

async function ban() {
  const id = banInput.value.trim();
  if (!id) { banError.value = "User ID is required"; return; }
  banError.value = null;
  await store.banUser(guildId.value, id);
  banInput.value = "";
  store.fetchConfiguredUsers(guildId.value);
}

async function unban() {
  if (!unbanTarget.value) return;
  await store.unbanUser(guildId.value, unbanTarget.value);
  unbanTarget.value = null;
  store.fetchConfiguredUsers(guildId.value);
}

const forbiddenList = () => store.forbiddenUsers.get(guildId.value) ?? [];
const configuredList = () => store.configuredUsers.get(guildId.value) ?? [];

function userName(discordUserId: string): string {
  const configured = configuredList().find((u) => u.discordUserId === discordUserId);
  return configured?.displayName ?? discordUserId;
}
</script>

<template>
  <AppShell>
    <h1 class="page-title">Users</h1>

    <section class="section">
      <h2 class="section__title">Look Up User</h2>
      <p class="section__desc">
        Enter a Discord user ID to view or manage admin notes, bans, and context settings.
      </p>
      <form class="lookup-form" @submit.prevent="lookup">
        <AppInput v-model="lookupInput" label="Discord User ID" placeholder="e.g. 1234567890" />
        <AppButton type="submit">View User</AppButton>
      </form>
    </section>

    <section class="section">
      <h2 class="section__title">Configured Users</h2>
      <p class="section__desc">Users with admin notes, bans, or context muting in this server.</p>
      <div v-if="configuredList().length" class="user-list">
        <RouterLink
          v-for="u in configuredList()"
          :key="u.discordUserId"
          :to="{ name: 'user-detail', params: { guildId, userId: u.discordUserId } }"
          class="user-row user-row--link"
        >
          <div class="user-row__info">
            <span class="user-row__name">{{ u.displayName }}</span>
            <span class="user-row__badges">
              <span v-if="u.hasAdminNotes" class="badge badge--notes">Notes</span>
              <span v-if="u.isBanned" class="badge badge--banned">Banned</span>
              <span v-if="u.isContextMuted" class="badge badge--muted">Muted</span>
            </span>
          </div>
          <span class="user-row__arrow">&rsaquo;</span>
        </RouterLink>
      </div>
      <EmptyState v-else message="No configured users yet." />
    </section>

    <section class="section">
      <h2 class="section__title">Ban User</h2>
      <p class="section__desc">Block a user from interacting with Quinn in this server.</p>
      <form class="lookup-form" @submit.prevent="ban">
        <AppInput v-model="banInput" label="Discord User ID" placeholder="Discord User ID" :error="banError" />
        <AppButton type="submit" variant="danger">Ban</AppButton>
      </form>

      <div v-if="forbiddenList().length" class="user-list">
        <div v-for="u in forbiddenList()" :key="u.discordUserId" class="user-row">
          <span class="user-row__id">{{ userName(u.discordUserId) }} <span class="user-row__uid">({{ u.discordUserId }})</span></span>
          <AppButton variant="ghost" @click="unbanTarget = u.discordUserId">Unban</AppButton>
        </div>
      </div>
      <EmptyState v-else message="No banned users." />
    </section>

    <ConfirmDialog
      v-if="unbanTarget"
      title="Unban user?"
      :message="`Remove ban for ${unbanTarget ? userName(unbanTarget) : ''}?`"
      confirm-label="Unban"
      @confirm="unban"
      @cancel="unbanTarget = null"
    />
  </AppShell>
</template>

<style scoped>
.page-title { margin: 0 0 1.5rem; font-size: 1.5rem; font-weight: 700; color: #fff; }
.section { background: #111214; border: 1px solid #2b2c30; border-radius: 10px; padding: 1.25rem; margin-bottom: 1rem; max-width: 560px; }
.section__title { margin: 0 0 0.25rem; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #666; }
.section__desc { margin: 0 0 1rem; font-size: 0.875rem; color: #888; }
.lookup-form { display: flex; align-items: flex-end; gap: 0.75rem; margin-bottom: 1rem; }
.user-list { display: flex; flex-direction: column; gap: 0.5rem; }
.user-row { display: flex; align-items: center; justify-content: space-between; padding: 0.625rem 0.75rem; background: #1e1f22; border-radius: 6px; }
.user-row--link { text-decoration: none; color: #e0e0e0; border: 1px solid transparent; transition: border-color 0.15s; }
.user-row--link:hover { border-color: #5865f2; }
.user-row__info { display: flex; align-items: center; gap: 0.625rem; min-width: 0; }
.user-row__name { font-size: 0.875rem; color: #e0e0e0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.user-row__badges { display: flex; gap: 0.375rem; flex-shrink: 0; }
.badge { font-size: 0.6875rem; padding: 0.125rem 0.5rem; border-radius: 9999px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; }
.badge--notes { background: #2d3a4d; color: #7aa2f7; }
.badge--banned { background: #4d2d2d; color: #f77a7a; }
.badge--muted { background: #4d3d2d; color: #f7c87a; }
.user-row__arrow { color: #666; font-size: 1.25rem; }
.user-row__id { font-size: 0.875rem; color: #e0e0e0; }
.user-row__uid { font-size: 0.75rem; color: #666; font-family: monospace; }
</style>
