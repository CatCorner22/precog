import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { openTestDb, type TestDb } from "@/test/pglite";
import {
  insertUsage,
  LLM_USAGE_RETENTION_MONTHS,
  purgeOldUsage,
  usageTotalsFor,
  type UsageRow,
} from "./usage-log.server";

const row = (over: Partial<UsageRow> = {}): UsageRow => ({
  userId: "adv",
  feature: "coach",
  model: "m1",
  promptTokens: 100,
  completionTokens: 20,
  outcome: "ok",
  ...over,
});

describe("model-call records", () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await openTestDb();
  }, 60_000);
  afterAll(async () => {
    await db.close();
  });
  beforeEach(async () => {
    await db.clear("llm_usage", '"user"');
    await db.seedUser("adv");
    await db.seedUser("mem");
  });

  const stored = () =>
    db.sql<Record<string, unknown>>`
      select user_id, feature, model, prompt_tokens, completion_tokens, outcome
      from llm_usage order by id
    `;

  it("stores one row per call with no text, keeping null counts of a failed call", async () => {
    await insertUsage(db.sql, row());
    await insertUsage(
      db.sql,
      row({ outcome: "timeout", promptTokens: null, completionTokens: null }),
    );
    expect(await stored()).toEqual([
      {
        user_id: "adv",
        feature: "coach",
        model: "m1",
        prompt_tokens: 100,
        completion_tokens: 20,
        outcome: "ok",
      },
      {
        user_id: "adv",
        feature: "coach",
        model: "m1",
        prompt_tokens: null,
        completion_tokens: null,
        outcome: "timeout",
      },
    ]);
  });

  it("purges rows older than 13 months and keeps the rest", async () => {
    expect(LLM_USAGE_RETENTION_MONTHS).toBe(13);
    await insertUsage(db.sql, row());
    await insertUsage(db.sql, row({ feature: "old" }));
    await insertUsage(db.sql, row({ feature: "edge" }));
    await db.sql`update llm_usage set called_at = now() - interval '13 months 1 day' where feature = 'old'`;
    await db.sql`update llm_usage set called_at = now() - interval '12 months 27 days' where feature = 'edge'`;
    expect(await purgeOldUsage(db.sql)).toBe(1);
    expect((await stored()).map((r) => r.feature)).toEqual(["coach", "edge"]);
    expect(await purgeOldUsage(db.sql)).toBe(0);
  });

  it("totals an account's calls and tokens per feature, and nobody else's", async () => {
    await insertUsage(db.sql, row());
    await insertUsage(db.sql, row({ promptTokens: 50, completionTokens: 5 }));
    await insertUsage(
      db.sql,
      row({ outcome: "error", promptTokens: null, completionTokens: null }),
    );
    await insertUsage(db.sql, row({ feature: "brief", promptTokens: 7, completionTokens: 3 }));
    await insertUsage(db.sql, row({ userId: "mem", promptTokens: 999 }));
    expect(await usageTotalsFor(db.sql, "adv")).toEqual([
      { feature: "brief", calls: 1, promptTokens: 7, completionTokens: 3 },
      { feature: "coach", calls: 3, promptTokens: 150, completionTokens: 25 },
    ]);
    expect(await usageTotalsFor(db.sql, "nobody")).toEqual([]);
  });

  it("sums by day, feature and model in the daily view, and leaves with the account", async () => {
    await insertUsage(db.sql, row());
    await insertUsage(
      db.sql,
      row({ promptTokens: null, completionTokens: null, outcome: "error" }),
    );
    const daily = await db.sql<Record<string, unknown>>`
      select feature, model, calls, prompt_tokens, completion_tokens from llm_usage_daily
    `;
    expect(daily.map((d) => ({ ...d, prompt_tokens: Number(d.prompt_tokens) }))).toEqual([
      { feature: "coach", model: "m1", calls: 2, prompt_tokens: 100, completion_tokens: 20 },
    ]);
    await db.sql`delete from "user" where id = 'adv'`;
    expect(await stored()).toEqual([]);
  });
});
