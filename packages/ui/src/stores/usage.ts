import { ref } from "vue";
import { defineStore } from "pinia";
import { adminApi } from "../api/admin.js";
import type { UsageOverview, GuildUsageSummary, UsagePeriod } from "../api/admin.js";

export const useUsageStore = defineStore("usage", () => {
  const overview = ref<UsageOverview | null>(null);
  const overviewStatus = ref<"idle" | "loading" | "error">("idle");

  const guildDetail = ref<GuildUsageSummary | null>(null);
  const guildDetailStatus = ref<"idle" | "loading" | "error">("idle");

  const period = ref<UsagePeriod>("30d");

  async function fetchOverview(p?: UsagePeriod): Promise<void> {
    if (p) period.value = p;
    overviewStatus.value = "loading";
    try {
      overview.value = await adminApi.getUsageOverview(period.value);
      overviewStatus.value = "idle";
    } catch {
      overviewStatus.value = "error";
    }
  }

  async function fetchGuildDetail(guildId: string, p?: UsagePeriod): Promise<void> {
    if (p) period.value = p;
    guildDetailStatus.value = "loading";
    try {
      guildDetail.value = await adminApi.getGuildUsage(guildId, period.value);
      guildDetailStatus.value = "idle";
    } catch {
      guildDetailStatus.value = "error";
    }
  }

  return { overview, overviewStatus, guildDetail, guildDetailStatus, period, fetchOverview, fetchGuildDetail };
});
