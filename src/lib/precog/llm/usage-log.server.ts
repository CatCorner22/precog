import type { Sql } from "@/lib/db";
import type { GrokUsageLine } from "./grok-client.server";

/**
 * Model-call records (migration 0049): one row per call with the account, the
 * feature, the model, the token counts the API reported and the outcome. No
 * prompt, no answer, no address. The `llm_usage_daily` view sums them by day,
 * feature and model for the Neon editor; the weekly run purges rows older
 * than LLM_USAGE_RETENTION_MONTHS; the account deletion cascades.
 */
export const LLM_USAGE_RETENTION_MONTHS = 13;

export type UsageRow = Pick<
  GrokUsageLine,
  "feature" | "model" | "promptTokens" | "completionTokens" | "outcome"
> & { userId: string | null };

/** Writes one record. Throws on failure; `callModel` catches and reports. */
export async function insertUsage(sql: Sql, row: UsageRow): Promise<void> {
  await sql`
    insert into llm_usage (user_id, feature, model, prompt_tokens, completion_tokens, outcome)
    values (${row.userId}, ${row.feature}, ${row.model}, ${row.promptTokens},
      ${row.completionTokens}, ${row.outcome})
  `;
}

/** Deletes records older than the retention period; returns how many went. */
export async function purgeOldUsage(sql: Sql): Promise<number> {
  const rows = await sql<{ n: number }>`
    with gone as (
      delete from llm_usage
      where called_at < now() - make_interval(months => ${LLM_USAGE_RETENTION_MONTHS}::int)
      returning 1
    )
    select count(*)::int as n from gone
  `;
  return Number(rows[0]?.n ?? 0);
}

export interface UsageTotal {
  feature: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
}

/** The account's calls and tokens per feature, for its export. */
export async function usageTotalsFor(sql: Sql, userId: string): Promise<UsageTotal[]> {
  const rows = await sql<{
    feature: string;
    calls: number;
    prompt_tokens: number | string;
    completion_tokens: number | string;
  }>`
    select feature, count(*)::int as calls,
      coalesce(sum(prompt_tokens), 0)::bigint as prompt_tokens,
      coalesce(sum(completion_tokens), 0)::bigint as completion_tokens
    from llm_usage where user_id = ${userId}
    group by feature order by feature
  `;
  return rows.map((r) => ({
    feature: r.feature,
    calls: Number(r.calls),
    promptTokens: Number(r.prompt_tokens),
    completionTokens: Number(r.completion_tokens),
  }));
}
