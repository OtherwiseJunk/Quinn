import { createRouter, createWebHistory } from "vue-router";
import { registerGuards } from "./guards.js";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/login",
      name: "login",
      component: () => import("../views/LoginView.vue"),
      meta: { public: true },
    },
    {
      path: "/forbidden",
      name: "forbidden",
      component: () => import("../views/ForbiddenView.vue"),
      meta: { public: true },
    },
    {
      path: "/",
      name: "dashboard",
      component: () => import("../views/DashboardView.vue"),
      meta: { role: "user" },
    },
    {
      path: "/me/context",
      name: "user-context",
      component: () => import("../views/user/UserContextView.vue"),
      meta: { role: "user" },
    },
    {
      path: "/guilds",
      name: "guilds",
      component: () => import("../views/guild/GuildsView.vue"),
      meta: { role: "server_admin" },
    },
    {
      path: "/guilds/:guildId/config",
      name: "guild-config",
      component: () => import("../views/guild/GuildConfigView.vue"),
      meta: { role: "server_admin" },
    },
    {
      path: "/guilds/:guildId/channels",
      name: "channel-list",
      component: () => import("../views/guild/ChannelListView.vue"),
      meta: { role: "server_admin" },
    },
    {
      path: "/guilds/:guildId/channels/:channelId",
      name: "channel-config",
      component: () => import("../views/guild/ChannelConfigView.vue"),
      meta: { role: "server_admin" },
    },
    {
      path: "/guilds/:guildId/users",
      name: "guild-users",
      component: () => import("../views/guild/UserListView.vue"),
      meta: { role: "server_admin" },
    },
    {
      path: "/guilds/:guildId/users/:userId",
      name: "user-detail",
      component: () => import("../views/guild/UserDetailView.vue"),
      meta: { role: "server_admin" },
    },
    {
      path: "/admin",
      name: "admin-dashboard",
      component: () => import("../views/admin/AdminDashboardView.vue"),
      meta: { role: "bot_owner" },
    },
    {
      path: "/admin/system-prompt",
      name: "system-prompt",
      component: () => import("../views/admin/SystemPromptView.vue"),
      meta: { role: "bot_owner" },
    },
    {
      path: "/admin/usage",
      name: "usage-overview",
      component: () => import("../views/admin/UsageOverviewView.vue"),
      meta: { role: "bot_owner" },
    },
    {
      path: "/admin/usage/:guildId",
      name: "usage-guild-detail",
      component: () => import("../views/admin/UsageGuildDetailView.vue"),
      meta: { role: "bot_owner" },
    },
    {
      path: "/admin/memories/self",
      name: "self-memories",
      component: () => import("../views/admin/SelfMemoriesView.vue"),
      meta: { role: "bot_owner" },
    },
    {
      path: "/admin/memories/users",
      name: "user-memories",
      component: () => import("../views/admin/UserMemoriesView.vue"),
      meta: { role: "bot_owner" },
    },
    {
      path: "/:pathMatch(.*)*",
      name: "not-found",
      component: () => import("../views/NotFoundView.vue"),
      meta: { public: true },
    },
  ],
});

registerGuards(router);

export default router;
