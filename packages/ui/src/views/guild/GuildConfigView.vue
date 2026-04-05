<script setup lang="ts">
import { reactive, watch, onMounted } from "vue";
import AppShell from "../../components/layout/AppShell.vue";
import AppToggle from "../../components/ui/AppToggle.vue";
import AppSlider from "../../components/ui/AppSlider.vue";
import AppTagInput from "../../components/ui/AppTagInput.vue";
import AppTextarea from "../../components/ui/AppTextarea.vue";
import AppButton from "../../components/ui/AppButton.vue";
import StatusBadge from "../../components/ui/StatusBadge.vue";
import GuildSelectorDropdown from "../../components/guild/GuildSelectorDropdown.vue";
import { useGuildConfigStore } from "../../stores/guildConfig.js";
import { useAuthStore } from "../../stores/auth.js";
import { useCurrentGuild } from "../../composables/useCurrentGuild.js";
import { useSaveState } from "../../composables/useSaveState.js";
import type { ServerConfig } from "@quinn/shared";

const store = useGuildConfigStore();
const auth = useAuthStore();
const { guildId } = useCurrentGuild();
const { status, errorMessage, save } = useSaveState();

const form = reactive<Omit<ServerConfig, "guildId">>({
  respondIfMentioned: true,
  respondToAll: false,
  forbiddenWords: [],
  forbiddenWordReply: "",
  displayThoughts: false,
  serverPrompt: null,
  responseRate: 25,
});

async function loadConfig(id: string) {
  localStorage.setItem("lastGuildId", id);
  await store.fetch(id);
  const config = store.configs.get(id);
  if (config) Object.assign(form, { ...config });
}

onMounted(() => loadConfig(guildId.value));

watch(guildId, (id) => loadConfig(id));

async function submit() {
  await save(() => store.save(guildId.value, { ...form }));
}

</script>

<template>
  <AppShell>
    <!-- Guild switcher -->
    <div class="page-header">
      <GuildSelectorDropdown
        :guilds="auth.adminGuilds"
        :current-guild-id="guildId"
        :target-route="(id) => `/guilds/${id}/config`"
      />
      <StatusBadge :status="status" :error="errorMessage" />
    </div>

    <form class="form" @submit.prevent="submit">
      <section class="section">
        <h2 class="section__title">Response Behavior</h2>
        <AppToggle v-model="form.respondIfMentioned" label="Respond when mentioned" hint="Quinn will always reply when directly mentioned or tagged." />
        <AppToggle v-model="form.respondToAll" label="Respond to all messages" hint="Quinn will consider responding to every message in permitted channels." />
        <AppToggle v-model="form.displayThoughts" label="Display thoughts" hint="Include Quinn's internal reasoning in replies." />
        <AppSlider v-model="form.responseRate" label="Response rate" hint="Chance Quinn generates a response to an unprompted message." />
      </section>

      <section class="section">
        <h2 class="section__title">Content Filtering</h2>
        <AppTagInput v-model="form.forbiddenWords" label="Forbidden words" hint="Inputs and outputs containing these words will be blocked." />
        <AppTextarea v-model="form.forbiddenWordReply" label="Forbidden word reply" :rows="2" hint="Ephemeral message sent to users who trigger a forbidden word." />
      </section>

      <section class="section">
        <h2 class="section__title">Server Prompt</h2>
        <AppTextarea
          :model-value="form.serverPrompt ?? ''"
          label="Server-level prompt"
          :rows="6"
          hint="Appended after the system prompt. Cannot override bot-owner restrictions."
          @update:model-value="form.serverPrompt = $event || null"
        />
      </section>

      <AppButton type="submit" :loading="status === 'saving'">Save Changes</AppButton>
    </form>

  </AppShell>
</template>

<style scoped>
.page-header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1.5rem; }
.form { display: flex; flex-direction: column; gap: 1.5rem; max-width: 640px; }
.section { display: flex; flex-direction: column; gap: 0; background: #111214; border: 1px solid #2b2c30; border-radius: 10px; padding: 1rem 1.25rem; }
.section__title { margin: 0 0 0.75rem; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #666; }
</style>
