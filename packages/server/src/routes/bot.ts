import { Router } from "express";
import { requireBotSecret } from "../middleware/requireBotSecret.js";
import { getServerConfig } from "../db/serverConfig.js";
import { getChannelConfig } from "../db/channelConfig.js";
import { getUserContext, upsertUserContext } from "../db/userContext.js";
import { getAdminUserContext } from "../db/adminUserContext.js";
import { isForbidden } from "../db/forbiddenUsers.js";
import { isTimedOut, recordDiscipline, getTimeoutStatus } from "../db/botTimeouts.js";
import { isContextMuted } from "../db/contextMutedUsers.js";
import { getSystemPrompt, getGlobalForbiddenWords, getContextMessageLimit } from "../db/systemPrompt.js";
import { resolveChannelConfig } from "../lib/resolveChannelConfig.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import {
  getMemories,
  addMemories,
  getPendingConsolidation,
  deleteMemories,
  updateMemory,
} from "../db/botMemory.js";
import { insertUsage } from "../db/apiUsage.js";

const router = Router();

router.use(requireBotSecret);

/** Resolved channel config — the bot's primary config lookup before processing a message */
router.get("/guilds/:guildId/channels/:channelId/resolved-config", asyncHandler(async (req, res) => {
  const { guildId, channelId } = req.params;
  const [server, channel, globalForbiddenWords] = await Promise.all([
    getServerConfig(guildId),
    getChannelConfig(channelId, guildId),
    getGlobalForbiddenWords(),
  ]);
  res.json(resolveChannelConfig(server, channel, globalForbiddenWords));
}));

/**
 * Context bundle — everything the bot needs to build the Groq request in one call.
 * Returns system prompt, server prompt, user context, and admin user context.
 */
router.get("/guilds/:guildId/users/:userId/context-bundle", asyncHandler(async (req, res) => {
  const { guildId, userId } = req.params;
  const [systemPrompt, server, userContext, adminUserContext, contextMessageLimit, contextMuted] = await Promise.all([
    getSystemPrompt(),
    getServerConfig(guildId),
    getUserContext(userId),
    getAdminUserContext(userId, guildId),
    getContextMessageLimit(),
    isContextMuted(userId, guildId),
  ]);
  res.json({
    systemPrompt,
    serverPrompt: server.serverPrompt,
    userContext: contextMuted ? null : (userContext?.context ?? null),
    adminUserContext: adminUserContext?.context ?? null,
    contextMessageLimit,
  });
}));

/** Check if a user is forbidden (admin ban or bot timeout) from interacting with Quinn in a guild */
router.get("/guilds/:guildId/forbidden-users/:userId", asyncHandler(async (req, res) => {
  const { userId, guildId } = req.params;
  const [banned, timedOut] = await Promise.all([
    isForbidden(userId, guildId),
    isTimedOut(userId, guildId),
  ]);
  res.json({ forbidden: banned || timedOut });
}));

/** Batch check which user IDs are forbidden (admin ban or bot timeout) in a guild */
router.post("/guilds/:guildId/forbidden-users/batch", asyncHandler(async (req, res) => {
  const { guildId } = req.params;
  const { userIds } = req.body as { userIds: string[] };
  const results = await Promise.all(
    userIds.map(async (uid) => {
      const [banned, timedOut] = await Promise.all([
        isForbidden(uid, guildId),
        isTimedOut(uid, guildId),
      ]);
      return banned || timedOut ? uid : null;
    })
  );
  res.json({ forbiddenIds: results.filter(Boolean) });
}));

/** Get timeout status for a user in a guild */
router.get("/guilds/:guildId/timeouts/:userId", asyncHandler(async (req, res) => {
  const { guildId, userId } = req.params;
  const status = await getTimeoutStatus(userId, guildId);
  res.json(status);
}));

/** Bot-initiated discipline — progressive escalation (warning → 1hr → 4hr → 8hr) */
router.post("/guilds/:guildId/timeouts/:userId", asyncHandler(async (req, res) => {
  const { guildId, userId } = req.params;
  const result = await recordDiscipline(userId, guildId);
  res.json(result);
}));

/** Get a user's self-provided context (used by bot to display back to user) */
router.get("/users/:userId/context", asyncHandler(async (req, res) => {
  const context = await getUserContext(req.params.userId);
  res.json({ userContext: context });
}));

/** Update a user's context via slash command on Discord */
router.put("/users/:userId/context", asyncHandler(async (req, res) => {
  const { context } = req.body as { context: string };
  if (typeof context !== "string" || context.length > 500) {
    res.status(400).json({ error: "context must be a string of 500 characters or fewer" });
    return;
  }
  const updated = await upsertUserContext(req.params.userId, context);
  res.json(updated);
}));

/** System prompt — fetched by the bot on startup or when building Groq requests */
router.get("/system-prompt", asyncHandler(async (_req, res) => {
  const prompt = await getSystemPrompt();
  res.json({ prompt });
}));

/** Get memories for a user in a guild, or Quinn's self memories if no userId query param */
router.get("/guilds/:guildId/memories", asyncHandler(async (req, res) => {
  const userId = (req.query.userId as string) || null;
  const memories = await getMemories(req.params.guildId, userId);
  res.json({ memories });
}));

/** Save new memories */
router.post("/guilds/:guildId/memories", asyncHandler(async (req, res) => {
  const { subjectUserId, memories } = req.body as {
    subjectUserId: string | null;
    memories: string[];
  };
  await addMemories(req.params.guildId, subjectUserId, memories);
  res.json({ ok: true });
}));

/** Delete memories by IDs */
router.delete("/guilds/:guildId/memories", asyncHandler(async (req, res) => {
  const { ids } = req.body as { ids: number[] };
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === "number")) {
    res.status(400).json({ error: "ids must be an array of numbers" });
    return;
  }
  await deleteMemories(ids);
  res.json({ ok: true, deleted: ids.length });
}));

/** Update memories by IDs */
router.patch("/guilds/:guildId/memories", asyncHandler(async (req, res) => {
  const { updates } = req.body as { updates: { id: number; content: string }[] };
  if (!Array.isArray(updates) || !updates.every((u) => typeof u.id === "number" && typeof u.content === "string")) {
    res.status(400).json({ error: "updates must be an array of { id: number, content: string }" });
    return;
  }
  await Promise.all(updates.map((u) => updateMemory(u.id, u.content)));
  res.json({ ok: true, updated: updates.length });
}));

/** Get groups with >50 memories that need consolidation */
router.get("/guilds/:guildId/memories/pending-consolidation", asyncHandler(async (req, res) => {
  const maxCount = parseInt(req.query.maxCount as string) || 50;
  const groups = await getPendingConsolidation(req.params.guildId, maxCount);
  res.json({ groups });
}));

/** Consolidate memories — keep some, delete others, optionally add merged ones */
router.post("/guilds/:guildId/memories/consolidate", asyncHandler(async (req, res) => {
  const { keepIds, deleteIds, merged } = req.body as {
    keepIds: number[];
    deleteIds: number[];
    merged?: { content: string; subjectUserId: string | null }[];
  };
  await deleteMemories(deleteIds);
  if (merged && merged.length > 0) {
    await Promise.all(
      merged.map((m) => addMemories(req.params.guildId, m.subjectUserId, [m.content]))
    );
  }
  res.json({ ok: true, kept: keepIds.length, deleted: deleteIds.length, merged: merged?.length ?? 0 });
}));

/** Record API usage from the bot (fire-and-forget from bot side) */
router.post("/usage", asyncHandler(async (req, res) => {
  const {
    guildId, channelId, userId,
    groqPromptTokens, groqCompletionTokens, groqCalls,
    e2bExecutionMs, e2bSuccess, estimatedCostUsd,
  } = req.body as {
    guildId: string;
    channelId: string;
    userId: string;
    groqPromptTokens: number;
    groqCompletionTokens: number;
    groqCalls: number;
    e2bExecutionMs?: number;
    e2bSuccess?: boolean;
    estimatedCostUsd: number;
  };
  await insertUsage({
    guildId, channelId, userId,
    groqPromptTokens, groqCompletionTokens, groqCalls,
    e2bExecutionMs, e2bSuccess, estimatedCostUsd,
  });
  res.json({ ok: true });
}));

export default router;
