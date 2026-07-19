import { type Message, type TextChannel } from "discord.js";
import {
  getResolvedConfig,
  getContextBundle,
  isForbiddenUser,
  getForbiddenUserIds,
  getMemories,
  saveMemories,
  deleteMemoriesById,
  updateMemoriesById,
  disciplineUser,
  reportUsage,
} from "../api/serverClient.js";
import { buildMessages, isThoughtMessage } from "../groq/buildMessages.js";
import { runAgentLoop } from "../groq/agentLoop.js";
import type { AgentLoopResult } from "../groq/agentLoop.js";
import { callGroqRaw } from "../groq/groqClient.js";
import type { GroqUsage } from "../groq/groqClient.js";
import { webSearch, isWebSearchEnabled } from "../groq/webSearch.js";
import { isCodeExecutionEnabled, executeCode } from "../e2b/sandbox.js";
import { recordMessage } from "../groq/temperament.js";
import { containsForbiddenWord } from "./forbiddenWords.js";
import { shouldRespond } from "./responseDecision.js";
import { estimateCost } from "./usageMeter.js";
import {
  startTyping,
  calculateTypingDelay,
  delay,
} from "./typingSimulator.js";
import { sendReply, sendChannel } from "./chunkedSend.js";
import { lock, unlock } from "../lock/channelLock.js";
import { sampleRandom } from "@quinn/shared";
import type { GroqRequestContext, BotMemory, ResolvedChannelConfig, ResolvedActions } from "@quinn/shared";
import { env } from "../env.js";
import { resolveUserPronounSet, replacePronouns, PronounSet } from "./pronounResolver.js";

const MAX_MEMORIES = 15;

/** Short label for log lines: "user#channel" */
function tag(message: Message): string {
  const user =
    message.member?.displayName ??
    message.author.displayName ??
    message.author.username;
  const channel =
    "name" in message.channel ? (message.channel as TextChannel).name : message.channelId;
  return `${user}#${channel}`;
}

/** Fetch context bundle and memories for the trigger author + mentioned users. */
async function fetchMemories(
  guildId: string,
  message: Message,
): Promise<{
  context: GroqRequestContext;
  selfMemories: BotMemory[];
  userMemories: BotMemory[];
  mentionedUserMemories: Map<string, BotMemory[]>;
}> {
  const mentionedUserIds = message.mentions.users
    .filter((u) => u.id !== message.author.id && !u.bot)
    .map((u) => u.id);

  const [context, allSelfMemories, allUserMemories, ...mentionedMemoryArrays] = await Promise.all([
    getContextBundle(guildId, message.author.id),
    getMemories(guildId, null),
    getMemories(guildId, message.author.id),
    ...mentionedUserIds.map((uid) => getMemories(guildId, uid)),
  ]);

  const selfMemories = sampleRandom(allSelfMemories, MAX_MEMORIES);
  const userMemories = sampleRandom(allUserMemories, MAX_MEMORIES);
  const mentionedUserMemories = new Map<string, BotMemory[]>();
  for (let i = 0; i < mentionedUserIds.length; i++) {
    const mems = sampleRandom(mentionedMemoryArrays[i], MAX_MEMORIES);
    if (mems.length > 0) {
      mentionedUserMemories.set(mentionedUserIds[i], mems);
    }
  }

  return { context, selfMemories, userMemories, mentionedUserMemories };
}

/** Fetch channel history, filtering out thought messages and forbidden users. */
async function fetchHistory(
  message: Message,
  botUserId: string,
  guildId: string,
  limit: number,
): Promise<Message[]> {
  const fetchCount = Math.min(limit * 2, 100);
  const fetched = await message.channel.messages.fetch({ limit: fetchCount });
  const sorted = [...fetched.values()].toSorted(
    (a, b) => a.createdTimestamp - b.createdTimestamp
  );
  const nonThought = sorted.filter(
    (m) => !(m.author.id === botUserId && isThoughtMessage(m))
  );

  const historyUserIds = [
    ...new Set(nonThought.filter((m) => !m.author.bot).map((m) => m.author.id)),
  ];
  const forbiddenIds = await getForbiddenUserIds(guildId, historyUserIds);
  const safe = forbiddenIds.size > 0
    ? nonThought.filter((m) => !forbiddenIds.has(m.author.id))
    : nonThought;
  const history = safe.slice(-limit);

  // Ensure the referenced message is in history if this is a reply
  if (message.reference?.messageId) {
    const refId = message.reference.messageId;
    if (!history.some((m) => m.id === refId)) {
      try {
        const refMsg = await message.channel.messages.fetch(refId);
        if (!forbiddenIds.has(refMsg.author.id)) {
          history.unshift(refMsg);
        }
      } catch {
        // Referenced message may have been deleted — ignore
      }
    }
  }

  return history;
}

/** Fire-and-forget API usage reporting. */
function reportApiUsage(
  groqUsages: GroqUsage[],
  guildId: string,
  channelId: string,
  userId: string,
  label: string,
  e2bDurationMs?: number,
  e2bSuccess?: boolean,
  searchCount?: number,
): void {
  const totalPromptTokens = groqUsages.reduce((sum, u) => sum + u.promptTokens, 0);
  const totalCompletionTokens = groqUsages.reduce((sum, u) => sum + u.completionTokens, 0);
  const cost = estimateCost(groqUsages, e2bDurationMs, searchCount);
  reportUsage({
    guildId,
    channelId,
    userId,
    groqPromptTokens: totalPromptTokens,
    groqCompletionTokens: totalCompletionTokens,
    groqCalls: groqUsages.length,
    e2bExecutionMs: e2bDurationMs,
    e2bSuccess,
    estimatedCostUsd: cost,
  }).catch((err) => console.error(`[Quinn] ${label}: failed to report usage:`, err));
}

/** Persist new memories, deletions, and updates from Quinn's response. */
function persistMemories(
  actions: ResolvedActions,
  guildId: string,
  userId: string,
  label: string,
): void {
  if (actions.rememberUser.length > 0) {
    console.log(
      `[Quinn] ${label}: saving ${actions.rememberUser.length} user memories: ${actions.rememberUser.join("; ")}`
    );
    saveMemories(guildId, userId, actions.rememberUser).catch(
      (err) => console.error(`[Quinn] ${label}: failed to save user memories:`, err)
    );
  }
  if (actions.rememberSelf.length > 0) {
    console.log(
      `[Quinn] ${label}: saving ${actions.rememberSelf.length} self memories: ${actions.rememberSelf.join("; ")}`
    );
    saveMemories(guildId, null, actions.rememberSelf).catch(
      (err) => console.error(`[Quinn] ${label}: failed to save self memories:`, err)
    );
  }
  if (actions.forget.length > 0) {
    console.log(
      `[Quinn] ${label}: deleting ${actions.forget.length} memories: [${actions.forget.join(", ")}]`
    );
    deleteMemoriesById(guildId, actions.forget).catch(
      (err) => console.error(`[Quinn] ${label}: failed to delete memories:`, err)
    );
  }
  if (actions.updateMemories.length > 0) {
    console.log(
      `[Quinn] ${label}: updating ${actions.updateMemories.length} memories: [${actions.updateMemories.map((u) => `#${u.id}`).join(", ")}]`
    );
    updateMemoriesById(guildId, actions.updateMemories).catch(
      (err) => console.error(`[Quinn] ${label}: failed to update memories:`, err)
    );
  }
}

/** Apply discipline if Quinn requested it, mutating the reply content. */
async function handleDiscipline(
  actions: ResolvedActions,
  guildId: string,
  userId: string,
  label: string,
): Promise<void> {
  if (!actions.timeout) return;
  if (!actions.reply) {
    console.error(`[Quinn] ${label}: timeout requested but no reply present — loop contract violated`);
    return;
  }
  try {
    console.log(`[Quinn] ${label}: requesting discipline`);
    const { level, durationHours } = await disciplineUser(guildId, userId);
    if (level === 0) {
      actions.reply.content = (actions.reply.content || "").trimEnd() +
        "\n\n⚠️ *Consider this a warning.*";
    } else {
      actions.reply.content = (actions.reply.content || "").trimEnd() +
        `\n\n⏱️ *You have been timed out for ${durationHours} hour(s).*`;
    }
  } catch (err) {
    console.error(`[Quinn] ${label}: failed to discipline user:`, err);
  }
}

/** Send Quinn's response: typing delay, optional thoughts, then the message. */
async function sendResponse(
  actions: ResolvedActions,
  config: ResolvedChannelConfig,
  message: Message,
  channel: TextChannel,
  label: string,
): Promise<void> {
  if (!actions.reply) {
    console.log(`[Quinn] ${label}: decided not to respond (silent)`);
    return;
  }
  const reply = actions.reply;

  if (
    config.forbiddenWords.length > 0 &&
    containsForbiddenWord(reply.content, config.forbiddenWords)
  ) {
    console.warn(`[Quinn] ${label}: discarded response (forbidden word in output)`);
    return;
  }

  const typingDelay = calculateTypingDelay(reply.content.length);
  const stopTyping = startTyping(message.channel);
  try {
    await delay(typingDelay);
  } finally {
    stopTyping();
  }

  if (config.displayThoughts && reply.thought) {
    await sendChannel(channel, "```\n" + reply.thought + "\n```");
  }

  console.log(
    `[Quinn] ${label}: responding (${reply.responseType}, ${reply.content.length} chars)`
  );
  if (reply.responseType === "reply") {
    await sendReply(message, reply.content);
  } else {
    await sendChannel(channel, reply.content);
  }
  recordMessage();
}

export async function processMessage(
  message: Message,
  botMentioned: boolean,
  skipHistory = false,
): Promise<void> {
  const { guildId, channelId } = message;
  if (!guildId) return;
  const channel = message.channel as TextChannel;
  const label = tag(message);

  lock(channelId);

  try {
    const forbidden = await isForbiddenUser(guildId, message.author.id);
    if (forbidden) {
      console.log(`[Quinn] ${label}: skipped (forbidden user)`);
      return;
    }

    const config = await getResolvedConfig(guildId, channelId);
    if (!shouldRespond(config, botMentioned)) return;

    console.log(
      `[Quinn] ${label}: processing (mentioned=${botMentioned}, respondToAll=${config.respondToAll})`
    );

    if (
      config.forbiddenWords.length > 0 &&
      containsForbiddenWord(message.content, config.forbiddenWords)
    ) {
      console.log(`[Quinn] ${label}: blocked (forbidden word in input)`);
      await message.reply(config.forbiddenWordReply).catch(() => {});
      return;
    }

    // Fetch context + memories
    const { context, selfMemories, userMemories, mentionedUserMemories } =
      await fetchMemories(guildId, message);

    console.log(
      `[Quinn] ${label}: context loaded (selfMemories=${selfMemories.length}, userMemories=${userMemories.length}, mentionedUsers=${mentionedUserMemories.size})`
    );

    if (config.activePrompt) {
      context.serverPrompt = config.activePrompt;
    }

    // Fetch channel history
    const botUserId = message.client.user!.id;
    let history: Message[] = [];
    if (skipHistory) {
      console.log(`[Quinn] ${label}: skipping history (queued message)`);
    } else {
      history = await fetchHistory(message, botUserId, guildId, context.contextMessageLimit);
    }

    // Build messages + call Groq
    const groqMessages = buildMessages(
      context, history, message, botUserId,
      selfMemories, userMemories, message.author.id,
      mentionedUserMemories
    );

    // Web-search side calls carry their own usage; collect them outside the loop.
    let searchCount = 0;
    const sideUsages: GroqUsage[] = [];
    const webSearchDep = isWebSearchEnabled()
      ? async (q: string) => {
          const r = await webSearch(q);
          searchCount++;
          sideUsages.push(r.usage);
          return r.text;
        }
      : undefined;

    const stopTyping = startTyping(message.channel);
    let loopResult: AgentLoopResult;
    try {
      loopResult = await runAgentLoop(
        groqMessages,
        { orchestratorModel: env.groqOrchestratorModel, replyModel: env.groqReplyModel },
        {
          callModel: callGroqRaw,
          executeCode: isCodeExecutionEnabled() ? executeCode : undefined,
          webSearch: webSearchDep,
          onStatus: (text) => { sendChannel(channel, text).catch(() => {}); },
        },
      );
    } finally {
      stopTyping();
    }
    const { actions } = loopResult;
    const groqUsages: GroqUsage[] = [...loopResult.usages, ...sideUsages];

    // Pronouns: thought lives on the reply now
    const pronounSet = resolveUserPronounSet(context.userContext, message.member ?? null);
    if (actions.reply && pronounSet !== null && pronounSet !== PronounSet.They) {
      actions.reply.thought = replacePronouns(actions.reply.thought, pronounSet, PronounSet.They);
    }

    reportApiUsage(groqUsages, guildId, channelId, message.author.id, label,
      loopResult.e2bDurationMs, loopResult.e2bSuccess, searchCount);

    if (actions.react) {
      console.log(`[Quinn] ${label}: reacting with ${actions.react.emoji}`);
      await message.react(actions.react.emoji).catch(() => {});
    }

    persistMemories(actions, guildId, message.author.id, label);
    await handleDiscipline(actions, guildId, message.author.id, label);
    await sendResponse(actions, config, message, channel, label);
  } catch (err) {
    console.error(`[Quinn] ${label}: error processing message:`, err);
  } finally {
    const queued = unlock(channelId);
    if (queued) {
      console.log(`[Quinn] ${label}: processing queued mention (no history)`);
      const queuedMentioned = queued.mentions.has(message.client.user!.id);
      processMessage(queued, queuedMentioned, true).catch((err) =>
        console.error(`[Quinn] error processing queued mention:`, err)
      );
    }
  }
}
