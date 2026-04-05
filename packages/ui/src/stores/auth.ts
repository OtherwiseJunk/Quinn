import { ref, computed } from "vue";
import { defineStore } from "pinia";
import type { AuthenticatedUser } from "@quinn/shared";
import { authApi } from "../api/auth.js";

export const useAuthStore = defineStore("auth", () => {
  const user = ref<AuthenticatedUser | null>(null);
  const status = ref<"idle" | "loading" | "error">("idle");

  const isAuthenticated = computed(() => user.value !== null);
  const role = computed(() => user.value?.role ?? null);
  const adminGuilds = computed(() => user.value?.adminGuilds ?? [])
  const adminGuildIds = computed(() => adminGuilds.value.map((g) => g.id));

  async function fetchMe(): Promise<void> {
    if (status.value === "loading") return;
    status.value = "loading";
    try {
      user.value = await authApi.getMe();
      status.value = "idle";
    } catch {
      user.value = null;
      status.value = "error";
    }
  }

  async function logout(): Promise<void> {
    await authApi.logout().catch(() => {});
    user.value = null;
    window.location.href = "/login";
  }

  return { user, status, isAuthenticated, role, adminGuilds, adminGuildIds, fetchMe, logout };
});
