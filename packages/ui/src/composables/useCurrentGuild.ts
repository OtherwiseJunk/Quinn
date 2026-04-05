import { computed } from "vue";
import { useRoute } from "vue-router";
import { useRole } from "./useRole.js";

export function useCurrentGuild() {
  const route = useRoute();
  const { canAccessGuild } = useRole();

  const guildId = computed(() => route.params.guildId as string);
  const hasAccess = computed(() => canAccessGuild(guildId.value));

  return { guildId, hasAccess };
}
