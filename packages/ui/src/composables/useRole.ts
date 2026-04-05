import type { UiRole } from "@quinn/shared";
import { useAuthStore } from "../stores/auth.js";

const ROLE_ORDER: UiRole[] = ["user", "server_admin", "bot_owner"];

export function useRole() {
  const auth = useAuthStore();

  function isAtLeast(role: UiRole): boolean {
    if (!auth.user) return false;
    return ROLE_ORDER.indexOf(auth.user.role) >= ROLE_ORDER.indexOf(role);
  }

  function canAccessGuild(guildId: string): boolean {
    if (!auth.user) return false;
    if (auth.user.role === "bot_owner") return true;
    return auth.user.adminGuilds.some((g) => g.id === guildId);
  }

  return { isAtLeast, canAccessGuild };
}
