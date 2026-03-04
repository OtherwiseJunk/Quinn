import type { Client } from "discordx";
import type { BotMemory } from "@quinn/shared";
import { getPendingConsolidation, consolidateMemories } from "../api/serverClient.js";
import { callGroq } from "../groq/groqClient.js";

interface ConsolidationResponse {
  keep: number[];
  discard: number[];
  merged: { replaces: number[]; content: string }[];
}
const MAX_MEMORIES_PER_GROUP = 50;
const TARGET_MEMORIES_PER_GROUP = 30;
const TARGET_MAX_MEMORIES_PER_GROUP = 40;

/**
 * For a set of memories, ask the llm to pick the most important ones to keep (up to 50),
 * optionally merging duplicates.
 */
async function consolidateGroup(
  memories: BotMemory[],
  isUserSpecific: boolean
): Promise<{ keepIds: number[]; deleteIds: number[]; merged: { content: string }[] }> {
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

Respond with JSON: { "keep": [id, ...], "discard": [id, ...], "merged": [{ "replaces": [id, ...], "content": "merged text" }, ...] }

Every memory ID must appear in exactly one of: "keep", "discard", or a "replaces" array in "merged".

Memories:
${memoryList}`;

  const { response } = await callGroq([
    { role: "system", content: "You are a memory consolidation assistant. Respond with valid JSON only." },
    { role: "user", content: prompt },
  ]);

  let parsed: ConsolidationResponse;
  try {
    parsed = JSON.parse(response.content) as ConsolidationResponse;
  } catch {
    // If the content isn't valid JSON, try to extract JSON from it
    const match = response.content.match(/\{[\s\S]*\}/);
    if (!match) {
      console.error("Failed to parse consolidation response");
      return { keepIds: [], deleteIds: [], merged: [] };
    }
    parsed = JSON.parse(match[0]) as ConsolidationResponse;
  }

  const deleteIds = [
    ...parsed.discard,
    ...parsed.merged.flatMap((m) => m.replaces),
  ];

  return {
    keepIds: parsed.keep,
    deleteIds,
    merged: parsed.merged.map((m) => ({ content: m.content })),
  };
}

export async function runConsolidation(client: Client): Promise<void> {
  console.log("Starting memory consolidation...");

  const guilds = client.guilds.cache;

  const guildIds = [...guilds.keys()];
  await Promise.all(
    guildIds.map(async (guildId) => {
      try {
        const groups = await getPendingConsolidation(guildId);

        await Promise.all(
          groups.map(async (group) => {
            try {
              const { keepIds, deleteIds, merged } = await consolidateGroup(
                group.memories,
                group.subjectUserId !== null
              );

              if (deleteIds.length > 0 || merged.length > 0) {
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
                  `Consolidated ${label} in guild ${guildId}: kept ${keepIds.length}, deleted ${deleteIds.length}, merged ${merged.length}`
                );
              }
            } catch (err) {
              console.error(
                `Failed to consolidate group (user=${group.subjectUserId}) in guild ${guildId}:`,
                err
              );
            }
          })
        );
      } catch (err) {
        console.error(`Failed to get pending consolidation for guild ${guildId}:`, err);
      }
    })
  );

  console.log("Memory consolidation complete.");
}
