<script setup lang="ts">
import { ref, onMounted } from "vue";
import AppShell from "../../components/layout/AppShell.vue";
import AppTextarea from "../../components/ui/AppTextarea.vue";
import AppButton from "../../components/ui/AppButton.vue";
import StatusBadge from "../../components/ui/StatusBadge.vue";
import { useUserContextStore } from "../../stores/userContext.js";
import { useSaveState } from "../../composables/useSaveState.js";

const store = useUserContextStore();
const { status, errorMessage, save } = useSaveState();
const draft = ref("");

onMounted(async () => {
  await store.fetch();
  draft.value = store.context?.context ?? "";
});

async function submit() {
  await save(() => store.save(draft.value));
}
</script>

<template>
  <AppShell>
    <div class="page-header">
      <h1 class="page-title">My Context</h1>
      <StatusBadge :status="status" :error="errorMessage" />
    </div>
    <p class="page-desc">
      Tell Quinn a bit about yourself. This is included in every conversation Quinn has with you.
      Keep it concise — max 500 characters.
    </p>
    <form class="form" @submit.prevent="submit">
      <AppTextarea
        v-model="draft"
        label="Your context"
        :max-length="500"
        :rows="6"
        hint="Examples: pronouns, preferred name, occupation, interests."
      />
      <AppButton type="submit" :loading="status === 'saving'">Save</AppButton>
    </form>
  </AppShell>
</template>

<style scoped>
.page-header { display: flex; align-items: center; gap: 1rem; margin-bottom: 0.5rem; }
.page-title { margin: 0; font-size: 1.5rem; font-weight: 700; color: #fff; }
.page-desc { margin: 0 0 1.5rem; font-size: 0.875rem; color: #888; }
.form { display: flex; flex-direction: column; gap: 1rem; max-width: 600px; }
</style>
