import { Router, type Request } from "express";

type GuildParams = { guildId: string };
type ChannelParams = { guildId: string; channelId: string };
type UserParams = { guildId: string; userId: string };
import { requireSession } from "../middleware/requireSession.js";
import { requireRole } from "../middleware/requireRole.js";
import { requireGuildAccess } from "../middleware/requireGuildAccess.js";
import { getServerConfig, upsertServerConfig } from "../db/serverConfig.js";
import { listChannelConfigs, getChannelConfig, upsertChannelConfig, deleteChannelConfig } from "../db/channelConfig.js";
import { getAdminUserContext, upsertAdminUserContext, deleteAdminUserContext } from "../db/adminUserContext.js";
import { listForbiddenUsers, addForbiddenUser, removeForbiddenUser } from "../db/forbiddenUsers.js";
import { isContextMuted, muteContext, unmuteContext } from "../db/contextMutedUsers.js";
import { getConfiguredUsers } from "../db/configuredUsers.js";
import { getTimeoutStatus, clearBotTimeout, setDisciplineLevel } from "../db/botTimeouts.js";
import { resolveDisplayNames } from "../lib/discordMembers.js";
import { env } from "../config.js";
import { asyncHandler } from "../lib/asyncHandler.js";

const router = Router({ mergeParams: true });

router.use(requireSession, requireRole("server_admin", "bot_owner"), requireGuildAccess);

// --- Discord channels proxy ---

router.get("/discord-channels", asyncHandler(async (req: Request<GuildParams>, res) => {
  if (!env.discordBotToken) {
    res.status(501).json({ error: "DISCORD_BOT_TOKEN not configured on the server" });
    return;
  }
  const response = await fetch(
    `https://discord.com/api/v10/guilds/${req.params.guildId}/channels`,
    { headers: { Authorization: `Bot ${env.discordBotToken}` } }
  );
  if (!response.ok) {
    // Never forward Discord's status code — a Discord 401 would trick
    // the client into thinking the *user* isn't authenticated.
    const discordBody = await response.json().catch(() => ({}));
    res.status(502).json({
      error: `Discord API error (${response.status}): ${(discordBody as { message?: string }).message ?? "unknown"}`,
    });
    return;
  }
  const channels = (await response.json()) as Array<{
    id: string;
    name: string;
    type: number;
    parent_id: string | null;
    position: number;
  }>;
  // Types: 0=text, 5=announcement, 4=category
  const relevant = channels.filter((c) => c.type === 0 || c.type === 5 || c.type === 4);
  res.json(relevant);
}));

// --- Server config ---

router.get("/config", asyncHandler(async (req: Request<GuildParams>, res) => {
  const config = await getServerConfig(req.params.guildId);
  res.json({ config });
}));

router.put("/config", asyncHandler(async (req: Request<GuildParams>, res) => {
  const config = await upsertServerConfig(req.params.guildId, req.body);
  res.json({ config });
}));

// --- Channel config ---

router.get("/channel-configs", asyncHandler(async (req: Request<GuildParams>, res) => {
  const configs = await listChannelConfigs(req.params.guildId);
  res.json({ configs });
}));

router.get("/channels/:channelId/config", asyncHandler(async (req: Request<ChannelParams>, res) => {
  const config = await getChannelConfig(req.params.channelId, req.params.guildId);
  res.json({ config });
}));

router.put("/channels/:channelId/config", asyncHandler(async (req: Request<ChannelParams>, res) => {
  const config = await upsertChannelConfig(req.params.channelId, req.params.guildId, req.body);
  res.json({ config });
}));

router.delete("/channels/:channelId/config", asyncHandler(async (req: Request<ChannelParams>, res) => {
  await deleteChannelConfig(req.params.channelId, req.params.guildId);
  res.status(204).send();
}));

// --- Configured users (quick-access list) ---

router.get("/configured-users", asyncHandler(async (req: Request<GuildParams>, res) => {
  const users = await getConfiguredUsers(req.params.guildId);
  const names = await resolveDisplayNames(
    req.params.guildId,
    users.map((u) => u.discordUserId)
  );
  res.json(users.map((u) => ({
    ...u,
    displayName: names.get(u.discordUserId) ?? u.discordUserId,
  })));
}));

// --- User display name ---

router.get("/users/:userId/display-name", asyncHandler(async (req: Request<UserParams>, res) => {
  const names = await resolveDisplayNames(req.params.guildId, [req.params.userId]);
  res.json({ displayName: names.get(req.params.userId) ?? req.params.userId });
}));

// --- Admin user context ---

router.get("/users/:userId/admin-context", asyncHandler(async (req: Request<UserParams>, res) => {
  const context = await getAdminUserContext(req.params.userId, req.params.guildId);
  res.json({ context });
}));

router.put("/users/:userId/admin-context", asyncHandler(async (req: Request<UserParams>, res) => {
  const { context } = req.body as { context: string };
  if (typeof context !== "string") {
    res.status(400).json({ error: "context must be a string" });
    return;
  }
  const updated = await upsertAdminUserContext(req.params.userId, req.params.guildId, context);
  res.json(updated);
}));

router.delete("/users/:userId/admin-context", asyncHandler(async (req: Request<UserParams>, res) => {
  await deleteAdminUserContext(req.params.userId, req.params.guildId);
  res.status(204).send();
}));

// --- Context muting ---

router.get("/users/:userId/context-muted", asyncHandler(async (req: Request<UserParams>, res) => {
  const muted = await isContextMuted(req.params.userId, req.params.guildId);
  res.json({ muted });
}));

router.put("/users/:userId/context-muted", asyncHandler(async (req: Request<UserParams>, res) => {
  const { muted } = req.body as { muted: boolean };
  if (muted) {
    await muteContext(req.params.userId, req.params.guildId);
  } else {
    await unmuteContext(req.params.userId, req.params.guildId);
  }
  res.json({ muted });
}));

// --- Forbidden users ---

router.get("/forbidden-users", asyncHandler(async (req: Request<GuildParams>, res) => {
  const users = await listForbiddenUsers(req.params.guildId);
  res.json(users);
}));

router.post("/forbidden-users", asyncHandler(async (req: Request<GuildParams>, res) => {
  const { discordUserId } = req.body as { discordUserId: string };
  if (typeof discordUserId !== "string") {
    res.status(400).json({ error: "discordUserId must be a string" });
    return;
  }
  const entry = await addForbiddenUser(discordUserId, req.params.guildId);
  res.status(201).json(entry);
}));

router.delete("/forbidden-users/:userId", asyncHandler(async (req: Request<UserParams>, res) => {
  await removeForbiddenUser(req.params.userId, req.params.guildId);
  res.status(204).send();
}));

// --- Timeout & discipline ---

router.get("/users/:userId/timeout-status", asyncHandler(async (req: Request<UserParams>, res) => {
  const status = await getTimeoutStatus(req.params.userId, req.params.guildId);
  res.json(status);
}));

router.put("/users/:userId/timeout-status", asyncHandler(async (req: Request<UserParams>, res) => {
  const { active, level } = req.body as { active: boolean; level: number };
  if (typeof active !== "boolean" || !Number.isInteger(level) || ![0, 1, 2, 3].includes(level)) {
    res.status(400).json({ error: "active must be boolean, level must be 0–3" });
    return;
  }
  const current = await getTimeoutStatus(req.params.userId, req.params.guildId);
  if (!active) {
    await clearBotTimeout(req.params.userId, req.params.guildId);
  }
  if (level !== (current.level ?? 0)) {
    await setDisciplineLevel(req.params.userId, req.params.guildId, level as 0 | 1 | 2 | 3);
  }
  const status = await getTimeoutStatus(req.params.userId, req.params.guildId);
  res.json(status);
}));

export default router;
