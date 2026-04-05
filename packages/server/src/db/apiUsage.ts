import { pool } from "./pool.js";

// Cost rates mirrored from bot's usageMeter.ts
const GROQ_INPUT_RATE = 0.11 / 1_000_000;
const GROQ_OUTPUT_RATE = 0.34 / 1_000_000;
const E2B_RATE_PER_MS = 0.000118 / 1000;

export interface UsageRecord {
  guildId: string;
  channelId: string;
  userId: string;
  groqPromptTokens: number;
  groqCompletionTokens: number;
  groqCalls: number;
  e2bExecutionMs?: number;
  e2bSuccess?: boolean;
  estimatedCostUsd: number;
}

export async function insertUsage(record: UsageRecord): Promise<void> {
  await pool.query(
    `INSERT INTO api_usage
       (guild_id, channel_id, user_id, groq_prompt_tokens, groq_completion_tokens,
        groq_calls, e2b_execution_ms, e2b_success, estimated_cost_usd)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      record.guildId,
      record.channelId,
      record.userId,
      record.groqPromptTokens,
      record.groqCompletionTokens,
      record.groqCalls,
      record.e2bExecutionMs ?? null,
      record.e2bSuccess ?? null,
      record.estimatedCostUsd,
    ]
  );
}

export interface GuildUsageSummary {
  groqPromptTokens: number;
  groqCompletionTokens: number;
  groqCalls: number;
  e2bExecutionMs: number;
  estimatedCostUsd: number;
  rawCostUsd: number;
}

export interface GuildUsageRow extends GuildUsageSummary {
  guildId: string;
}

export interface UsageOverview {
  totals: GuildUsageSummary;
  guilds: GuildUsageRow[];
}

function computeRawCost(promptTokens: number, completionTokens: number, e2bMs: number): number {
  return promptTokens * GROQ_INPUT_RATE + completionTokens * GROQ_OUTPUT_RATE + e2bMs * E2B_RATE_PER_MS;
}

export async function getUsageByGuild(
  guildId: string,
  since?: Date
): Promise<GuildUsageSummary> {
  const params: unknown[] = [guildId];
  let whereClause = "WHERE guild_id = $1";
  if (since) {
    whereClause += " AND created_at >= $2";
    params.push(since);
  }

  const result = await pool.query(
    `SELECT
       COALESCE(SUM(groq_prompt_tokens), 0)::int AS groq_prompt_tokens,
       COALESCE(SUM(groq_completion_tokens), 0)::int AS groq_completion_tokens,
       COALESCE(SUM(groq_calls), 0)::int AS groq_calls,
       COALESCE(SUM(e2b_execution_ms), 0)::int AS e2b_execution_ms,
       COALESCE(SUM(estimated_cost_usd), 0)::numeric AS estimated_cost_usd
     FROM api_usage
     ${whereClause}`,
    params
  );

  const row = result.rows[0];
  const promptTokens = row.groq_prompt_tokens;
  const completionTokens = row.groq_completion_tokens;
  const e2bMs = row.e2b_execution_ms;

  return {
    groqPromptTokens: promptTokens,
    groqCompletionTokens: completionTokens,
    groqCalls: row.groq_calls,
    e2bExecutionMs: e2bMs,
    estimatedCostUsd: parseFloat(row.estimated_cost_usd),
    rawCostUsd: computeRawCost(promptTokens, completionTokens, e2bMs),
  };
}

export async function getUsageOverview(since?: Date): Promise<UsageOverview> {
  const params: unknown[] = [];
  let whereClause = "";
  if (since) {
    whereClause = "WHERE created_at >= $1";
    params.push(since);
  }

  const result = await pool.query(
    `SELECT
       guild_id,
       COALESCE(SUM(groq_prompt_tokens), 0)::int AS groq_prompt_tokens,
       COALESCE(SUM(groq_completion_tokens), 0)::int AS groq_completion_tokens,
       COALESCE(SUM(groq_calls), 0)::int AS groq_calls,
       COALESCE(SUM(e2b_execution_ms), 0)::int AS e2b_execution_ms,
       COALESCE(SUM(estimated_cost_usd), 0)::numeric AS estimated_cost_usd
     FROM api_usage
     ${whereClause}
     GROUP BY guild_id
     ORDER BY SUM(estimated_cost_usd) DESC`,
    params
  );

  const guilds: GuildUsageRow[] = result.rows.map((row) => {
    const promptTokens = row.groq_prompt_tokens;
    const completionTokens = row.groq_completion_tokens;
    const e2bMs = row.e2b_execution_ms;
    return {
      guildId: row.guild_id,
      groqPromptTokens: promptTokens,
      groqCompletionTokens: completionTokens,
      groqCalls: row.groq_calls,
      e2bExecutionMs: e2bMs,
      estimatedCostUsd: parseFloat(row.estimated_cost_usd),
      rawCostUsd: computeRawCost(promptTokens, completionTokens, e2bMs),
    };
  });

  const totals: GuildUsageSummary = {
    groqPromptTokens: 0,
    groqCompletionTokens: 0,
    groqCalls: 0,
    e2bExecutionMs: 0,
    estimatedCostUsd: 0,
    rawCostUsd: 0,
  };

  for (const g of guilds) {
    totals.groqPromptTokens += g.groqPromptTokens;
    totals.groqCompletionTokens += g.groqCompletionTokens;
    totals.groqCalls += g.groqCalls;
    totals.e2bExecutionMs += g.e2bExecutionMs;
    totals.estimatedCostUsd += g.estimatedCostUsd;
    totals.rawCostUsd += g.rawCostUsd;
  }

  return { totals, guilds };
}
