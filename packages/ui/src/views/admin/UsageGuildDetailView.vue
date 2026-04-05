<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import AppShell from "../../components/layout/AppShell.vue";
import GuildIcon from "../../components/guild/GuildIcon.vue";
import { useUsageStore } from "../../stores/usage.js";
import { useAuthStore } from "../../stores/auth.js";
import type { UsagePeriod } from "../../api/admin.js";

const store = useUsageStore();
const auth = useAuthStore();
const route = useRoute();

const guildId = computed(() => route.params.guildId as string);
const guild = computed(() => auth.adminGuilds.find((g) => g.id === guildId.value) ?? null);
const guildName = computed(() => guild.value?.name ?? guildId.value);

const periods: { label: string; value: UsagePeriod }[] = [
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
  { label: "All", value: "all" },
];

function selectPeriod(p: UsagePeriod) {
  store.fetchGuildDetail(guildId.value, p);
}

const d = computed(() => store.guildDetail);

function fmtCost(v: number) { return "$" + v.toFixed(4); }
function fmtTokens(v: number) { return v.toLocaleString(); }
function fmtMs(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

onMounted(() => store.fetchGuildDetail(guildId.value));
</script>

<template>
  <AppShell>
    <RouterLink to="/admin/usage" class="back-link">&larr; All Servers</RouterLink>

    <div class="page-header">
      <GuildIcon v-if="guild" :guild="guild" :size="32" />
      <h1 class="page-title">{{ guildName }}</h1>
    </div>
    <p class="page-desc">Usage breakdown for this server.</p>

    <div class="period-bar">
      <button
        v-for="p in periods"
        :key="p.value"
        class="period-btn"
        :class="{ 'period-btn--active': store.period === p.value }"
        @click="selectPeriod(p.value)"
      >{{ p.label }}</button>
    </div>

    <div v-if="store.guildDetailStatus === 'loading' && !d" class="loading">Loading...</div>
    <div v-else-if="store.guildDetailStatus === 'error'" class="error">Failed to load usage data.</div>
    <template v-else-if="d">
      <div class="stat-cards">
        <div class="stat-card">
          <span class="stat-card__label">Raw Cost</span>
          <span class="stat-card__value">{{ fmtCost(d.rawCostUsd) }}</span>
        </div>
        <div class="stat-card">
          <span class="stat-card__label">Charged Cost</span>
          <span class="stat-card__value">{{ fmtCost(d.estimatedCostUsd) }}</span>
        </div>
        <div class="stat-card">
          <span class="stat-card__label">Prompt Tokens</span>
          <span class="stat-card__value">{{ fmtTokens(d.groqPromptTokens) }}</span>
        </div>
        <div class="stat-card">
          <span class="stat-card__label">Completion Tokens</span>
          <span class="stat-card__value">{{ fmtTokens(d.groqCompletionTokens) }}</span>
        </div>
        <div class="stat-card">
          <span class="stat-card__label">Groq Calls</span>
          <span class="stat-card__value">{{ fmtTokens(d.groqCalls) }}</span>
        </div>
        <div class="stat-card">
          <span class="stat-card__label">E2B Time</span>
          <span class="stat-card__value">{{ fmtMs(d.e2bExecutionMs) }}</span>
        </div>
      </div>
    </template>
  </AppShell>
</template>

<style scoped>
.back-link { display: inline-block; margin-bottom: 1rem; color: #9da8f0; font-size: 0.8rem; text-decoration: none; }
.back-link:hover { text-decoration: underline; }

.page-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem; }
.page-title { margin: 0; font-size: 1.5rem; font-weight: 700; color: #fff; }
.page-desc { margin: 0 0 1.5rem; font-size: 0.875rem; color: #888; max-width: 600px; }

.period-bar { display: flex; gap: 0.25rem; margin-bottom: 1.5rem; }
.period-btn {
  padding: 0.35rem 0.75rem; border-radius: 6px; border: 1px solid #3a3b3e;
  background: transparent; color: #b0b0b0; font-size: 0.8rem; cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.period-btn:hover { background: #3a3b3e; color: #e0e0e0; }
.period-btn--active { background: #5865f220; color: #9da8f0; border-color: #5865f2; }

.stat-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 0.75rem; }
.stat-card {
  display: flex; flex-direction: column; gap: 0.25rem; padding: 1rem;
  background: #111214; border: 1px solid #2b2c30; border-radius: 10px;
}
.stat-card__label { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #888; }
.stat-card__value { font-size: 1.25rem; font-weight: 700; color: #fff; }

.loading, .error { color: #888; font-size: 0.875rem; padding: 2rem 0; }
.error { color: #f04747; }
</style>
