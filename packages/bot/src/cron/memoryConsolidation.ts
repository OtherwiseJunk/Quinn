import type { Client } from "discordx";
import type { BotMemory } from "@quinn/shared";
import { getPendingConsolidation, consolidateMemories } from "../api/serverClient.js";
import { callConsolidation } from "../groq/consolidationClient.js";

interface ConsolidationResponse {
  reasoning: string;
  keep: number[];
  discard: number[];
  merged: { replaces: number[]; content: string }[];
}
const MAX_MEMORIES_PER_GROUP = 50;
const TARGET_MEMORIES_PER_GROUP = 30;
const TARGET_MAX_MEMORIES_PER_GROUP = 40;

const LOG = "[Consolidation]";

/**
 * For a set of memories, ask the llm to pick the most important ones to keep (up to 50),
 * optionally merging duplicates.
 */
async function consolidateGroup(
  memories: BotMemory[],
  isUserSpecific: boolean,
  guildId: string,
  subjectUserId: string | null,
): Promise<{ keepIds: number[]; deleteIds: number[]; merged: { content: string }[] }> {
  const label = subjectUserId ? `user ${subjectUserId}` : "self/server";

  console.log(`${LOG} [${guildId}/${label}] Building consolidation prompt for ${memories.length} memories`);

  const memoryList = memories
    .map((m) => `[${m.id}] ${m.content}`)
    .join("\n");

  const subjectDesc = isUserSpecific
    ? "about a specific user"
    : "about themselves and this server";

  const prompt = `You are Quinn's memory manager. Below are Quinn's memories ${subjectDesc}.
There are ${memories.length} memories — too many. Your goal is to aggressively consolidate them down to around ${TARGET_MEMORIES_PER_GROUP} (and no more than ${TARGET_MAX_MEMORIES_PER_GROUP}).

IMPORTANT priorities:
- MERGE similar, overlapping, or related memories into single concise entries. Many memories will say nearly the same thing in different words — combine them.
- DISCARD trivial, outdated, redundant, or low-value memories.
- KEEP only the most meaningful and distinct memories.
- When merging, write one clear sentence that captures the combined meaning.
- It's better to have 25 high-quality memories than 45 mediocre ones.

Respond with JSON: { "reasoning": "2-3 sentence summary of your consolidation strategy and what you prioritized/discarded", "keep": [id, ...], "discard": [id, ...], "merged": [{ "replaces": [id, ...], "content": "merged text" }, ...] }

Every memory ID must appear in exactly one of: "keep", "discard", or a "replaces" array in "merged".

Memories:
${memoryList}`;

  console.log(`${LOG} [${guildId}/${label}] Calling Groq for consolidation...`);

  const result = await callConsolidation([
    { role: "system", content: "You are a memory consolidation assistant. Respond with valid JSON only." },
    { role: "user", content: prompt },
  ]);

  console.log(`${LOG} [${guildId}/${label}] Groq responded (${result.usage.promptTokens}→${result.usage.completionTokens} tokens)`);

  let parsed: ConsolidationResponse;
  try {
    parsed = JSON.parse(result.content) as ConsolidationResponse;
  } catch {
    // If the content isn't valid JSON, try to extract JSON from it
    const match = result.content.match(/\{[\s\S]*\}/);
    if (!match) {
      console.error(`${LOG} [${guildId}/${label}] Failed to parse consolidation response. Raw content: ${result.content.slice(0, 500)}`);
      return { keepIds: [], deleteIds: [], merged: [] };
    }
    console.log(`${LOG} [${guildId}/${label}] Extracted JSON from non-JSON response`);
    parsed = JSON.parse(match[0]) as ConsolidationResponse;
  }

  // Log the LLM's reasoning
  if (parsed.reasoning) {
    console.log(`${LOG} [${guildId}/${label}] Strategy: ${parsed.reasoning}`);
  }

  // Validate that every memory ID is accounted for
  const memoryIds = new Set(memories.map((m) => m.id));
  const allReferenced = new Set([
    ...parsed.keep,
    ...parsed.discard,
    ...parsed.merged.flatMap((m) => m.replaces),
  ]);
  const missing = [...memoryIds].filter((id) => !allReferenced.has(id));
  const unknown = [...allReferenced].filter((id) => !memoryIds.has(id));
  if (missing.length > 0) {
    console.warn(`${LOG} [${guildId}/${label}] WARNING: ${missing.length} memory IDs not accounted for: [${missing.join(", ")}] — will keep them`);
    parsed.keep.push(...missing);
  }
  if (unknown.length > 0) {
    console.warn(`${LOG} [${guildId}/${label}] WARNING: ${unknown.length} unknown IDs referenced: [${unknown.join(", ")}] — ignoring`);
    parsed.keep = parsed.keep.filter((id) => memoryIds.has(id));
    parsed.discard = parsed.discard.filter((id) => memoryIds.has(id));
    parsed.merged = parsed.merged.map((m) => ({
      ...m,
      replaces: m.replaces.filter((id) => memoryIds.has(id)),
    }));
  }

  const deleteIds = [
    ...parsed.discard,
    ...parsed.merged.flatMap((m) => m.replaces),
  ];

  // Detailed breakdown
  console.log(`${LOG} [${guildId}/${label}] Result: keep=${parsed.keep.length}, discard=${parsed.discard.length}, merged=${parsed.merged.length} (replaces ${parsed.merged.reduce((s, m) => s + m.replaces.length, 0)} memories)`);
  console.log(`${LOG} [${guildId}/${label}] Net change: ${memories.length} → ${parsed.keep.length + parsed.merged.length} memories`);

  if (parsed.discard.length > 0) {
    const discardedContent = parsed.discard.map((id) => {
      const mem = memories.find((m) => m.id === id);
      return mem ? `  - [${id}] ${mem.content}` : `  - [${id}] (not found)`;
    });
    console.log(`${LOG} [${guildId}/${label}] Discarded memories:\n${discardedContent.join("\n")}`);
  }

  if (parsed.merged.length > 0) {
    const mergeLog = parsed.merged.map((m) => {
      const originals = m.replaces.map((id) => {
        const mem = memories.find((mem) => mem.id === id);
        return mem ? `    [${id}] ${mem.content}` : `    [${id}] (not found)`;
      });
      return `  Merge → "${m.content}"\n    Replaces:\n${originals.join("\n")}`;
    });
    console.log(`${LOG} [${guildId}/${label}] Merged memories:\n${mergeLog.join("\n")}`);
  }

  return {
    keepIds: parsed.keep,
    deleteIds,
    merged: parsed.merged.map((m) => ({ content: m.content })),
  };
}

export async function runConsolidation(client: Client): Promise<void> {
  const startTime = Date.now();
  console.log(`${LOG} === Starting memory consolidation run ===`);

  const guilds = client.guilds.cache;
  const guildIds = [...guilds.keys()];
  console.log(`${LOG} Processing ${guildIds.length} guild(s): [${guildIds.join(", ")}]`);

  let totalGroups = 0;
  let totalKept = 0;
  let totalDeleted = 0;
  let totalMerged = 0;

  await Promise.all(
    guildIds.map(async (guildId) => {
      const guildName = guilds.get(guildId)?.name ?? guildId;
      try {
        console.log(`${LOG} [${guildId}] Fetching pending consolidation for "${guildName}"...`);
        const groups = await getPendingConsolidation(guildId);

        if (groups.length === 0) {
          console.log(`${LOG} [${guildId}] No groups over threshold — nothing to do`);
          return;
        }

        console.log(`${LOG} [${guildId}] Found ${groups.length} group(s) over threshold:`);
        for (const group of groups) {
          const label = group.subjectUserId ? `user ${group.subjectUserId}` : "self/server";
          console.log(`${LOG} [${guildId}]   - ${label}: ${group.memories.length} memories`);
        }

        for (const group of groups) {
          try {
            const { keepIds, deleteIds, merged } = await consolidateGroup(
              group.memories,
              group.subjectUserId !== null,
              guildId,
              group.subjectUserId,
            );

            if (deleteIds.length > 0 || merged.length > 0) {
              console.log(`${LOG} [${guildId}] Applying consolidation: deleting ${deleteIds.length}, inserting ${merged.length} merged...`);
              await consolidateMemories(
                guildId,
                keepIds,
                deleteIds,
                merged.map((m) => ({
                  content: m.content,
                  subjectUserId: group.subjectUserId,
                }))
              );

              const label = group.subjectUserId
                ? `user ${group.subjectUserId}`
                : "self/server";
              console.log(
                `${LOG} [${guildId}] Consolidated ${label}: kept ${keepIds.length}, deleted ${deleteIds.length}, merged ${merged.length}`
              );

              totalGroups++;
              totalKept += keepIds.length;
              totalDeleted += deleteIds.length;
              totalMerged += merged.length;
            } else {
              const label = group.subjectUserId ? `user ${group.subjectUserId}` : "self/server";
              console.log(`${LOG} [${guildId}] No changes needed for ${label}`);
            }
          } catch (err) {
            console.error(
              `${LOG} [${guildId}] Failed to consolidate group (user=${group.subjectUserId}):`,
              err
            );
          }
        }
      } catch (err) {
        console.error(`${LOG} [${guildId}] Failed to get pending consolidation:`, err);
      }
    })
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`${LOG} === Consolidation complete in ${elapsed}s — ${totalGroups} group(s) processed: kept ${totalKept}, deleted ${totalDeleted}, merged ${totalMerged} ===`);
}
