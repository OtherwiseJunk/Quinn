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
import { buildMessages, buildSecondPassMessages, isThoughtMessage } from "../groq/buildMessages.js";
import { callGroq } from "../groq/groqClient.js";
import type { GroqUsage } from "../groq/groqClient.js";
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
import type { QuinnResponse, GroqRequestContext, BotMemory, ResolvedChannelConfig } from "@quinn/shared";
import type { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions";

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

/** Run E2B code execution and return a second-pass Groq response. */
async function handleCodeExecution(
  response: QuinnResponse,
  groqMessages: ChatCompletionMessageParam[],
  message: Message,
  label: string,
): Promise<{ response: QuinnResponse; usage?: GroqUsage; e2bDurationMs?: number; e2bSuccess?: boolean }> {
  if (!response.run_code) return { response };

  const e2bEnabled = isCodeExecutionEnabled();
  console.log(
    `[Quinn] ${label}: run_code requested (${response.run_code.language}, ${response.run_code.code.length} chars), e2b=${e2bEnabled ? "enabled" : "DISABLED"}`
  );

  if (!e2bEnabled) {
    response.run_code = undefined;
    return { response };
  }

  const { language, code } = response.run_code;
  console.log(`[Quinn] ${label}: executing ${language} code via E2B:\n${code}`);

  const codeResult = await executeCode(language, code);
  console.log(`[Quinn] ${label}: E2B result:`, {
    success: codeResult.success,
    stdout: codeResult.stdout || "(empty)",
    stderr: codeResult.stderr || "(empty)",
    error: codeResult.error ?? null,
    durationMs: codeResult.durationMs,
  });

  const codeThought = [
    `[ran ${language} code]`,
    code,
    `[result: ${codeResult.success ? "success" : "error"}]`,
    codeResult.stdout || undefined,
    codeResult.error ? `Error: ${codeResult.error}` : undefined,
  ].filter(Boolean).join("\n");

  const secondPassMessages = buildSecondPassMessages(groqMessages, response.run_code, codeResult);
  console.log(`[Quinn] ${label}: calling Groq second pass (${secondPassMessages.length} messages)`);

  const stopTyping = startTyping(message.channel);
  let secondResponse: QuinnResponse;
  let usage: GroqUsage;
  try {
    const secondCall = await callGroq(secondPassMessages);
    secondResponse = secondCall.response;
    usage = secondCall.usage;
  } finally {
    stopTyping();
  }

  secondResponse.thought_process = codeThought + "\n\n" + secondResponse.thought_process;
  secondResponse.run_code = undefined;
  console.log(`[Quinn] ${label}: second pass complete, will send response`);

  return {
    response: secondResponse,
    usage,
    e2bDurationMs: codeResult.durationMs,
    e2bSuccess: codeResult.success,
  };
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
): void {
  const totalPromptTokens = groqUsages.reduce((sum, u) => sum + u.promptTokens, 0);
  const totalCompletionTokens = groqUsages.reduce((sum, u) => sum + u.completionTokens, 0);
  const cost = estimateCost(groqUsages, e2bDurationMs);
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
  response: QuinnResponse,
  guildId: string,
  userId: string,
  label: string,
): void {
  if (response.new_memories && response.new_memories.length > 0) {
    console.log(
      `[Quinn] ${label}: saving ${response.new_memories.length} user memories: ${response.new_memories.join("; ")}`
    );
    saveMemories(guildId, userId, response.new_memories).catch(
      (err) => console.error(`[Quinn] ${label}: failed to save user memories:`, err)
    );
  }
  if (response.new_self_memories && response.new_self_memories.length > 0) {
    console.log(
      `[Quinn] ${label}: saving ${response.new_self_memories.length} self memories: ${response.new_self_memories.join("; ")}`
    );
    saveMemories(guildId, null, response.new_self_memories).catch(
      (err) => console.error(`[Quinn] ${label}: failed to save self memories:`, err)
    );
  }
  if (response.delete_memories && response.delete_memories.length > 0) {
    console.log(
      `[Quinn] ${label}: deleting ${response.delete_memories.length} memories: [${response.delete_memories.join(", ")}]`
    );
    deleteMemoriesById(guildId, response.delete_memories).catch(
      (err) => console.error(`[Quinn] ${label}: failed to delete memories:`, err)
    );
  }
  if (response.update_memories && response.update_memories.length > 0) {
    console.log(
      `[Quinn] ${label}: updating ${response.update_memories.length} memories: [${response.update_memories.map((u) => `#${u.id}`).join(", ")}]`
    );
    updateMemoriesById(guildId, response.update_memories).catch(
      (err) => console.error(`[Quinn] ${label}: failed to update memories:`, err)
    );
  }
}

/** Apply discipline if Quinn requested it, mutating the response content. */
async function handleDiscipline(
  response: QuinnResponse,
  guildId: string,
  userId: string,
  label: string,
): Promise<void> {
  if (!response.timeout_user) return;
  try {
    console.log(`[Quinn] ${label}: requesting discipline`);
    const { level, durationHours } = await disciplineUser(guildId, userId);
    if (level === 0) {
      response.content = (response.content || "").trimEnd() +
        "\n\n⚠️ *Consider this a warning.*";
    } else {
      response.content = (response.content || "").trimEnd() +
        `\n\n⏱️ *You have been timed out for ${durationHours} hour(s).*`;
    }
    response.should_respond = true;
  } catch (err) {
    console.error(`[Quinn] ${label}: failed to discipline user:`, err);
  }
}

/** Send Quinn's response: typing delay, optional thoughts, then the message. */
async function sendResponse(
  response: QuinnResponse,
  config: ResolvedChannelConfig,
  message: Message,
  channel: TextChannel,
  label: string,
): Promise<void> {
  if (!response.should_respond) {
    const action = response.should_react ? "react-only" : "silent";
    console.log(`[Quinn] ${label}: decided not to respond (${action})`);
    return;
  }

  if (
    config.forbiddenWords.length > 0 &&
    containsForbiddenWord(response.content, config.forbiddenWords)
  ) {
    console.warn(`[Quinn] ${label}: discarded response (forbidden word in output)`);
    return;
  }

  const typingDelay = calculateTypingDelay(response.content.length);
  const stopTyping = startTyping(message.channel);
  try {
    await delay(typingDelay);
  } finally {
    stopTyping();
  }

  if (config.displayThoughts && response.thought_process) {
    await sendChannel(channel, "```\n" + response.thought_process + "\n```");
  }

  console.log(
    `[Quinn] ${label}: responding (${response.response_type}, ${response.content.length} chars)`
  );
  if (response.response_type === "reply") {
    await sendReply(message, response.content);
  } else {
    await sendChannel(channel, response.content);
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

    const groqUsages: GroqUsage[] = [];
    const stopTyping = startTyping(message.channel);
    let response: QuinnResponse;
    try {
      const firstCall = await callGroq(groqMessages);
      response = firstCall.response;
      groqUsages.push(firstCall.usage);
    } finally {
      stopTyping();
    }

    // Code execution (two-pass)
    const codeExec = await handleCodeExecution(response, groqMessages, message, label);
    response = codeExec.response;
    if (codeExec.usage) groqUsages.push(codeExec.usage);

    // Side effects
    reportApiUsage(groqUsages, guildId, channelId, message.author.id, label, codeExec.e2bDurationMs, codeExec.e2bSuccess);

    if (response.should_react && response.reaction_emoji) {
      console.log(`[Quinn] ${label}: reacting with ${response.reaction_emoji}`);
      await message.react(response.reaction_emoji).catch(() => {});
    }

    persistMemories(response, guildId, message.author.id, label);
    await handleDiscipline(response, guildId, message.author.id, label);
    await sendResponse(response, config, message, channel, label);
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
