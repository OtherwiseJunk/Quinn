<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import AppShell from "../../components/layout/AppShell.vue";
import GuildIcon from "../../components/guild/GuildIcon.vue";
import { useUsageStore } from "../../stores/usage.js";
import { useAuthStore } from "../../stores/auth.js";
import type { UsagePeriod } from "../../api/admin.js";

const store = useUsageStore();
const auth = useAuthStore();
const router = useRouter();

const periods: { label: string; value: UsagePeriod }[] = [
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
  { label: "All", value: "all" },
];

function selectPeriod(p: UsagePeriod) {
  store.fetchOverview(p);
}

function resolveGuild(guildId: string) {
  return auth.adminGuilds.find((g) => g.id === guildId) ?? null;
}

function guildName(guildId: string) {
  return resolveGuild(guildId)?.name ?? guildId;
}

function goToGuild(guildId: string) {
  router.push(`/admin/usage/${guildId}`);
}

const totals = computed(() => store.overview?.totals);
const guilds = computed(() => store.overview?.guilds ?? []);

function fmtCost(v: number) { return "$" + v.toFixed(4); }
function fmtTokens(v: number) { return v.toLocaleString(); }
function fmtMs(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

onMounted(() => store.fetchOverview());
</script>

<template>
  <AppShell>
    <div class="page-header">
      <h1 class="page-title">API Usage</h1>
    </div>
    <p class="page-desc">Raw and charged costs across all servers.</p>

    <div class="period-bar">
      <button
        v-for="p in periods"
        :key="p.value"
        class="period-btn"
        :class="{ 'period-btn--active': store.period === p.value }"
        @click="selectPeriod(p.value)"
      >{{ p.label }}</button>
    </div>

    <div v-if="store.overviewStatus === 'loading' && !totals" class="loading">Loading...</div>
    <div v-else-if="store.overviewStatus === 'error'" class="error">Failed to load usage data.</div>
    <template v-else-if="totals">
      <div class="stat-cards">
        <div class="stat-card">
          <span class="stat-card__label">Raw Cost</span>
          <span class="stat-card__value">{{ fmtCost(totals.rawCostUsd) }}</span>
        </div>
        <div class="stat-card">
          <span class="stat-card__label">Charged Cost</span>
          <span class="stat-card__value">{{ fmtCost(totals.estimatedCostUsd) }}</span>
        </div>
        <div class="stat-card">
          <span class="stat-card__label">Total Tokens</span>
          <span class="stat-card__value">{{ fmtTokens(totals.groqPromptTokens + totals.groqCompletionTokens) }}</span>
        </div>
        <div class="stat-card">
          <span class="stat-card__label">Groq Calls</span>
          <span class="stat-card__value">{{ fmtTokens(totals.groqCalls) }}</span>
        </div>
        <div class="stat-card">
          <span class="stat-card__label">E2B Time</span>
          <span class="stat-card__value">{{ fmtMs(totals.e2bExecutionMs) }}</span>
        </div>
      </div>

      <h2 class="section-title">Per-Server Breakdown</h2>
      <div class="table-wrap">
        <table class="usage-table">
          <thead>
            <tr>
              <th>Server</th>
              <th class="r">Raw Cost</th>
              <th class="r">Charged</th>
              <th class="r">Tokens</th>
              <th class="r">Calls</th>
              <th class="r">E2B Time</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="g in guilds" :key="g.guildId" class="clickable" @click="goToGuild(g.guildId)">
              <td class="guild-cell">
                <GuildIcon v-if="resolveGuild(g.guildId)" :guild="resolveGuild(g.guildId)!" :size="20" />
                <span>{{ guildName(g.guildId) }}</span>
              </td>
              <td class="r">{{ fmtCost(g.rawCostUsd) }}</td>
              <td class="r">{{ fmtCost(g.estimatedCostUsd) }}</td>
              <td class="r">{{ fmtTokens(g.groqPromptTokens + g.groqCompletionTokens) }}</td>
              <td class="r">{{ fmtTokens(g.groqCalls) }}</td>
              <td class="r">{{ fmtMs(g.e2bExecutionMs) }}</td>
            </tr>
            <tr v-if="guilds.length === 0">
              <td colspan="6" class="empty">No usage data for this period.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </AppShell>
</template>

<style scoped>
.page-header { display: flex; align-items: center; gap: 1rem; margin-bottom: 0.5rem; }
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

.stat-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 0.75rem; margin-bottom: 2rem; }
.stat-card {
  display: flex; flex-direction: column; gap: 0.25rem; padding: 1rem;
  background: #111214; border: 1px solid #2b2c30; border-radius: 10px;
}
.stat-card__label { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #888; }
.stat-card__value { font-size: 1.25rem; font-weight: 700; color: #fff; }

.section-title { font-size: 1rem; font-weight: 600; color: #e0e0e0; margin: 0 0 0.75rem; }

.table-wrap { overflow-x: auto; }
.usage-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; }
.usage-table th { text-align: left; padding: 0.5rem 0.75rem; color: #888; font-weight: 600; border-bottom: 1px solid #2b2c30; }
.usage-table td { padding: 0.6rem 0.75rem; color: #e0e0e0; border-bottom: 1px solid #1e1f22; }
.usage-table .r { text-align: right; }
.guild-cell { display: flex; align-items: center; gap: 0.5rem; }
.clickable { cursor: pointer; transition: background 0.15s; }
.clickable:hover { background: #1e1f22; }
.empty { text-align: center; color: #666; padding: 2rem 0.75rem; }
.loading, .error { color: #888; font-size: 0.875rem; padding: 2rem 0; }
.error { color: #f04747; }
</style>
