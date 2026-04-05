import type { Router } from "vue-router";
import type { UiRole } from "@quinn/shared";
import { useAuthStore } from "../stores/auth.js";

const ROLE_ORDER: UiRole[] = ["user", "server_admin", "bot_owner"];

function isAtLeast(userRole: UiRole, required: UiRole): boolean {
  return ROLE_ORDER.indexOf(userRole) >= ROLE_ORDER.indexOf(required);
}

export function registerGuards(router: Router) {
  router.beforeEach(async (to) => {
    const auth = useAuthStore();

    // Skip auth entirely for public routes — avoids 401 → redirect loop on initial load
    const isPublic = to.meta.public === true;
    if (isPublic) return true;

    // Bootstrap auth state on first navigation; refresh in background on subsequent ones
    if (!auth.user) {
      await auth.fetchMe();
    } else {
      auth.fetchMe();
    }

    if (!auth.user) return { name: "login" };

    const requiredRole = to.meta.role as UiRole | undefined;
    if (requiredRole && !isAtLeast(auth.user.role, requiredRole)) {
      return { name: "forbidden" };
    }

    // Guild route access check
    if (to.params.guildId && auth.user.role !== "bot_owner") {
      const guildId = to.params.guildId as string;
      if (!auth.user.adminGuilds.some((g) => g.id === guildId)) {
        return { name: "forbidden" };
      }
    }

    return true;
  });
}
