import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Sql } from "@/lib/db";
import { inTransaction, toSql } from "@/lib/sql-transaction";
import { openSafetyDb, type SafetyDb } from "@/test/safety-db";
import { insertReviewEvent } from "../firm/store";
import type { ReviewResult } from "../firm/reviews";
import type { ControlExecution } from "./executions/model";
import { bridgeMonthlyReview, type SavedMonthlyReview } from "./review-bridge.server";
import { monthlyEntryResult, monthlyEntryVersion } from "./review-bridge";

// The race database keeps its tables in a schema of its own, where the
// readiness check (which looks in public) cannot see them.
vi.mock("@/lib/migration-status.server", () => ({ controlExecutionLogReady: async () => true }));
vi.mock("@/lib/observability/report.server", () => ({ reportServerError: async () => {} }));

function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function taggedSql(sql: Sql, tag: string): Sql {
  const wrapped = toSql(<T>(text: string, params: unknown[]) =>
    sql.query<T>(`/* ${tag} */ ${text}`, params),
  );
  wrapped.transaction = (work) => inTransaction(sql, (tx) => work(taggedSql(tx, tag)));
  return wrapped;
}

/** `sql` whose transaction stops after the first statement matching `at` until `release`. */
function pausedAfter(
  sql: Sql,
  at: RegExp,
  reached: ReturnType<typeof signal>,
  release: ReturnType<typeof signal>,
): Sql {
  const wrapped = toSql(<T>(text: string, params: unknown[]) => sql.query<T>(text, params));
  wrapped.transaction = (work) =>
    inTransaction(sql, (tx) => {
      let paused = false;
      const inner = toSql(async <T>(text: string, params: unknown[]) => {
        const rows = await tx.query<T>(text, params);
        if (!paused && at.test(text)) {
          paused = true;
          reached.resolve();
          await release.promise;
        }
        return rows;
      });
      inner.transaction = (nested) => nested(inner);
      return work(inner);
    });
  return wrapped;
}

const DAY = "2026-04-16";
const review = (result: ReviewResult, notes: string): SavedMonthlyReview => ({
  businessId: "biz_race",
  period: "2026-04",
  itemKey: "bank_statement",
  ownerName: "Owner",
  dueOn: "2026-05-10",
  result,
  notes,
});

// A skip in the ordinary embedded suite is explicit; the dedicated CI command
// refuses to start without the opt-in and isolated PostgreSQL URL.
describe.runIf(process.env.PRECOG_LIFECYCLE_POSTGRES === "1")(
  "real PostgreSQL monthly review bridge interleavings",
  () => {
    let db: SafetyDb;
    beforeAll(async () => {
      db = await openSafetyDb();
    }, 60_000);
    afterAll(async () => {
      await db?.close();
    });
    beforeEach(async () => {
      await db.pg.exec('delete from "user"');
      await db.seedUser("owner");
      await db.sql`insert into businesses(user_id,id,name,industry,profile)
        values ('owner','biz_race','Race fixture','general','{}')`;
    });

    /** The monthly log's latest result, and the result of the evidence chain's newest entry. */
    async function bothLogs() {
      const [latest] = await db.sql<{ result: string }>`select result from review_events
        where user_id='owner' and business_id='biz_race' and period='2026-04'
          and item_key='bank_statement'
        order by recorded_at desc, id desc limit 1`;
      const runs = await db.sql<{ record: ControlExecution }>`select record
        from control_execution_log where user_id='owner' and business_id='biz_race'`;
      const current = runs
        .map((r) => r.record)
        .sort(
          (a, b) =>
            (monthlyEntryVersion(b.id, "2026-04", "bank_statement") ?? 0) -
            (monthlyEntryVersion(a.id, "2026-04", "bank_statement") ?? 0),
        )[0];
      return {
        monthly: latest?.result ?? null,
        evidence: current ? monthlyEntryResult(current) : null,
        entries: runs.length,
      };
    }

    it("makes a save wait while a bridge reads and writes, so the evidence log ends on the latest result", async () => {
      const exception = review("exception", "Unknown payee.");
      const done = review("done", "Opened it again.");
      await insertReviewEvent(db.sql, "owner", exception, "owner");
      // The Exception's bridge stops after reading the latest monthly result.
      const reached = signal();
      const release = signal();
      const bridging = bridgeMonthlyReview(
        pausedAfter(db.sql, /from review_events/i, reached, release),
        "owner",
        exception,
        DAY,
      );
      await reached.promise;
      // A Done saved from another device meanwhile waits on the business lock.
      const tag = `save_${randomUUID().replaceAll("-", "")}`;
      const saving = insertReviewEvent(taggedSql(db.sql, tag), "owner", done, "owner");
      try {
        await expect
          .poll(
            async () => {
              const [row] = await db.sql<{ n: number }>`select count(*)::int as n
                from pg_stat_activity where query like ${`/* ${tag} */%`}
                  and wait_event_type='Lock'`;
              return row.n;
            },
            { timeout: 5_000, interval: 20 },
          )
          .toBeGreaterThan(0);
      } finally {
        release.resolve();
      }
      // The Exception was the latest result when its bridge read it.
      expect(await bridging).toMatchObject({ evidenceStatus: "recorded" });
      await saving;
      // The Done's own bridge then corrects the entry, and both logs end on Done.
      expect(await bridgeMonthlyReview(db.sql, "owner", done, DAY)).toMatchObject({
        evidenceStatus: "corrected",
      });
      expect(await bothLogs()).toEqual({ monthly: "done", evidence: "done", entries: 2 });
    });

    it("ends both logs on the same result when two devices save at once", async () => {
      for (let round = 0; round < 8; round++) {
        await db.sql`delete from review_events`;
        await db.sql`delete from control_execution_log`;
        const saves = (["exception", "done"] as const).map(async (result) => {
          const saved = review(result, `Round ${round}.`);
          await insertReviewEvent(db.sql, "owner", saved, "owner");
          return bridgeMonthlyReview(db.sql, "owner", saved, DAY);
        });
        const outcomes = await Promise.all(saves);
        expect(outcomes.every((o) => o.evidenceSkippedReason !== "bridge_failed")).toBe(true);
        const logs = await bothLogs();
        expect(logs.evidence).toBe(logs.monthly);
      }
    });
  },
);
