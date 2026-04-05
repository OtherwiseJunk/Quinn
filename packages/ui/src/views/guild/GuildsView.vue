<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../../stores/auth.js";

const router = useRouter();
const auth = useAuthStore();

onMounted(() => {
  const lastId = localStorage.getItem("lastGuildId");
  const guilds = auth.adminGuilds;
  const target =
    (lastId && guilds.find((g) => g.id === lastId)?.id) ?? guilds[0]?.id;
  if (target) {
    router.replace({ name: "guild-config", params: { guildId: target } });
  } else {
    // No admin guilds — send home
    router.replace({ name: "dashboard" });
  }
});
</script>

<template></template>
