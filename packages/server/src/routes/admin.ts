import { Router } from "express";
import { requireSession } from "../middleware/requireSession.js";
import { requireRole } from "../middleware/requireRole.js";
import { getSystemPrompt, setSystemPrompt, getGlobalForbiddenWords, setGlobalForbiddenWords, getContextMessageLimit, setContextMessageLimit } from "../db/systemPrompt.js";
import { getUsageOverview, getUsageByGuild } from "../db/apiUsage.js";
import { getMemories, getMemoryUsers, addMemories, updateMemory, deleteMemories } from "../db/botMemory.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { resolveDisplayNames } from "../lib/discordMembers.js";

function parseSince(period: string | undefined): Date | undefined {
  const now = Date.now();
  switch (period) {
    case "24h": return new Date(now - 24 * 60 * 60 * 1000);
    case "7d":  return new Date(now - 7 * 24 * 60 * 60 * 1000);
    case "30d": return new Date(now - 30 * 24 * 60 * 60 * 1000);
    default:    return undefined;
  }
}

const router = Router();

router.use(requireSession, requireRole("bot_owner"));

router.get("/system-prompt", asyncHandler(async (_req, res) => {
  const prompt = await getSystemPrompt();
  res.json({ prompt });
}));

router.put("/system-prompt", asyncHandler(async (req, res) => {
  const { prompt } = req.body as { prompt: string };
  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    res.status(400).json({ error: "prompt must be a non-empty string" });
    return;
  }
  await setSystemPrompt(prompt);
  res.json({ prompt });
}));

router.get("/global-forbidden-words", asyncHandler(async (_req, res) => {
  const words = await getGlobalForbiddenWords();
  res.json({ words });
}));

router.put("/global-forbidden-words", asyncHandler(async (req, res) => {
  const { words } = req.body as { words: string[] };
  if (!Array.isArray(words) || !words.every((w) => typeof w === "string")) {
    res.status(400).json({ error: "words must be an array of strings" });
    return;
  }
  await setGlobalForbiddenWords(words);
  res.json({ words });
}));

router.get("/context-message-limit", asyncHandler(async (_req, res) => {
  const limit = await getContextMessageLimit();
  res.json({ limit });
}));

router.put("/context-message-limit", asyncHandler(async (req, res) => {
  const { limit } = req.body as { limit: number };
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    res.status(400).json({ error: "limit must be an integer between 1 and 100" });
    return;
  }
  await setContextMessageLimit(limit);
  res.json({ limit });
}));

router.get("/usage", asyncHandler(async (req, res) => {
  const since = parseSince(req.query.period as string | undefined);
  const overview = await getUsageOverview(since);
  res.json(overview);
}));

router.get("/usage/:guildId", asyncHandler(async (req, res) => {
  const since = parseSince(req.query.period as string | undefined);
  const summary = await getUsageByGuild(req.params.guildId, since);
  res.json(summary);
}));

// ── Memory CRUD ──

router.get("/memories/:guildId", asyncHandler(async (req, res) => {
  const userId = req.query.userId as string | undefined;
  const memories = await getMemories(req.params.guildId, userId ?? null);
  res.json(memories);
}));

router.get("/memories/:guildId/users", asyncHandler(async (req, res) => {
  const users = await getMemoryUsers(req.params.guildId);
  const names = await resolveDisplayNames(
    req.params.guildId,
    users.map((u) => u.userId)
  );
  res.json(users.map((u) => ({ ...u, displayName: names.get(u.userId) ?? u.userId })));
}));

router.post("/memories/:guildId", asyncHandler(async (req, res) => {
  const { subjectUserId, content } = req.body as { subjectUserId: string | null; content: string };
  if (typeof content !== "string" || content.trim().length === 0) {
    res.status(400).json({ error: "content must be a non-empty string" });
    return;
  }
  await addMemories(req.params.guildId, subjectUserId ?? null, [content]);
  res.status(201).json({ ok: true });
}));

router.put("/memories/:guildId/:memoryId", asyncHandler(async (req, res) => {
  const { content } = req.body as { content: string };
  if (typeof content !== "string" || content.trim().length === 0) {
    res.status(400).json({ error: "content must be a non-empty string" });
    return;
  }
  await updateMemory(Number(req.params.memoryId), content);
  res.json({ ok: true });
}));

router.delete("/memories/:guildId/:memoryId", asyncHandler(async (_req, res) => {
  await deleteMemories([Number(_req.params.memoryId)]);
  res.status(204).end();
}));

export default router;
