<script setup lang="ts">
import { reactive, ref, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppShell from "../../components/layout/AppShell.vue";
import AppToggle from "../../components/ui/AppToggle.vue";
import AppSlider from "../../components/ui/AppSlider.vue";
import AppTagInput from "../../components/ui/AppTagInput.vue";
import AppTextarea from "../../components/ui/AppTextarea.vue";
import AppButton from "../../components/ui/AppButton.vue";
import StatusBadge from "../../components/ui/StatusBadge.vue";
import ConfirmDialog from "../../components/ui/ConfirmDialog.vue";
import { useChannelConfigStore } from "../../stores/channelConfig.js";
import { useCurrentGuild } from "../../composables/useCurrentGuild.js";
import { useSaveState } from "../../composables/useSaveState.js";
import { useAuthStore } from "../../stores/auth.js";
import GuildSelectorDropdown from "../../components/guild/GuildSelectorDropdown.vue";
import type { ChannelConfig } from "@quinn/shared";

const auth = useAuthStore();

const store = useChannelConfigStore();
const { guildId } = useCurrentGuild();
const route = useRoute();
const router = useRouter();
const { status, errorMessage, save } = useSaveState();
const showConfirm = ref(false);

const channelId = route.params.channelId as string;

type FormState = Omit<ChannelConfig, "channelId" | "guildId">;
const form = reactive<FormState>({
  respondIfMentioned: null,
  respondToAll: null,
  forbiddenWords: [],
  responseRate: null,
  displayThoughts: null,
  channelPrompt: null,
});

// Local slider value for nullable responseRate
const localRate = ref(25);

onMounted(async () => {
  await store.fetch(guildId.value, channelId);
  const config = store.get(guildId.value, channelId);
  if (config) {
    Object.assign(form, config);
    localRate.value = config.responseRate ?? 25;
  }
});

async function submit() {
  await save(() =>
    store.save(guildId.value, channelId, {
      ...form,
      responseRate: form.responseRate,
    })
  );
}

async function deleteConfig() {
  await store.remove(guildId.value, channelId);
  router.push({ name: "channel-list", params: { guildId: guildId.value } });
}
</script>

<template>
  <AppShell>
    <div class="page-header">
      <GuildSelectorDropdown
        :guilds="auth.adminGuilds"
        :current-guild-id="guildId"
        :target-route="(id) => `/guilds/${id}/config`"
      />
      <StatusBadge :status="status" :error="errorMessage" />
    </div>
    <div class="channel-header">
      <h1 class="page-title"># {{ channelId }}</h1>
      <p class="page-desc">Channel overrides — null fields inherit from server config.</p>
    </div>

    <form class="form" @submit.prevent="submit">
      <section class="section">
        <h2 class="section__title">Response Behavior</h2>
        <AppToggle v-model="form.respondIfMentioned" label="Respond when mentioned" :nullable="true" />
        <AppToggle v-model="form.respondToAll" label="Respond to all messages" :nullable="true" />
        <AppToggle v-model="form.displayThoughts" label="Display thoughts" :nullable="true" />

        <div class="slider-nullable">
          <AppToggle
            :model-value="form.responseRate !== null"
            label="Override response rate"
            hint="When off, uses the server-level rate."
            @update:model-value="form.responseRate = $event ? localRate : null"
          />
          <AppSlider
            v-if="form.responseRate !== null"
            v-model="localRate"
            label="Response rate"
            @update:model-value="form.responseRate = localRate"
          />
        </div>
      </section>

      <section class="section">
        <h2 class="section__title">Additional Forbidden Words</h2>
        <AppTagInput
          v-model="form.forbiddenWords"
          label="Channel forbidden words"
          hint="These are added to the server-level list, not replacing it."
        />
      </section>

      <section class="section">
        <h2 class="section__title">Channel Prompt</h2>
        <AppTextarea
          :model-value="form.channelPrompt ?? ''"
          label="Channel-level prompt"
          :rows="5"
          hint="Overrides the server-level prompt for this channel. Leave empty to use server prompt."
          @update:model-value="form.channelPrompt = $event || null"
        />
      </section>

      <div class="actions">
        <AppButton type="submit" :loading="status === 'saving'">Save Changes</AppButton>
        <AppButton variant="danger" @click="showConfirm = true">Remove Channel Config</AppButton>
      </div>
    </form>

    <ConfirmDialog
      v-if="showConfirm"
      title="Remove channel config?"
      message="This channel will revert to using server defaults."
      confirm-label="Remove"
      @confirm="deleteConfig"
      @cancel="showConfirm = false"
    />
  </AppShell>
</template>

<style scoped>
.page-header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
.channel-header { margin-bottom: 1.5rem; }
.page-title { margin: 0; font-size: 1.5rem; font-weight: 700; color: #fff; font-family: monospace; }
.page-desc { margin: 0.25rem 0 0; font-size: 0.8rem; color: #666; }
.form { display: flex; flex-direction: column; gap: 1.5rem; max-width: 640px; }
.section { display: flex; flex-direction: column; gap: 0; background: #111214; border: 1px solid #2b2c30; border-radius: 10px; padding: 1rem 1.25rem; }
.section__title { margin: 0 0 0.75rem; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #666; }
.slider-nullable { display: flex; flex-direction: column; }
.actions { display: flex; gap: 0.75rem; }
</style>
