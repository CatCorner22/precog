import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { openSafetyDb, type SafetyDb } from "@/test/safety-db";
import { inTransaction, toSql } from "@/lib/sql-transaction";
import type { Sql } from "@/lib/db";
import { executeControlCommand } from "./store";
import { insertReviewEvent } from "../../firm/store";
import { lockReportVersion } from "../../firm/reports";
import { setEngagementStatus } from "../../firm/engagement-store";

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
function pausedAfterBusinessLock(
  sql: Sql,
  tag: string,
  locked: ReturnType<typeof signal>,
  release: ReturnType<typeof signal>,
): Sql {
  const wrapped = toSql(<T>(text: string, params: unknown[]) =>
    sql.query<T>(`/* ${tag} */ ${text}`, params),
  );
  wrapped.transaction = (work) =>
    inTransaction(sql, (tx) => {
      let paused = false;
      const inner = toSql(async <T>(text: string, params: unknown[]) => {
        const rows = await tx.query<T>(`/* ${tag} */ ${text}`, params);
        if (!paused && /select firm_user_id from businesses[\s\S]*for update/i.test(text)) {
          paused = true;
          locked.resolve();
          await release.promise;
        }
        return rows;
      });
      inner.transaction = (nested) => nested(inner);
      return work(inner);
    });
  return wrapped;
}
const record = {
  action: "record",
  commandId: "record",
  runId: "check",
  baseRevision: 0,
  controlKey: "bank_statement",
  period: "2026-08",
  performedOn: "2026-09-03",
  performedBy: "prep",
  method: "inspection",
  scope: "All August statement lines",
  evidenceRefs: ["Restricted statement"],
  result: "no_exception",
  note: "Compared source records.",
};
const review = {
  action: "review",
  commandId: "review",
  runId: "check",
  baseRevision: 1,
  method: "inspection",
  evidenceRefs: ["Independent workpaper"],
  result: "no_exception",
  note: "Inspected the stated population and evidence.",
  independenceConfirmed: true,
};
// A skip in the ordinary embedded suite is explicit; the dedicated CI command
// refuses to start without the opt-in and isolated PostgreSQL URL.
describe.runIf(process.env.PRECOG_LIFECYCLE_POSTGRES === "1")(
  "real PostgreSQL authorization interleavings",
  () => {
    let db: SafetyDb;
    beforeAll(async () => {
      db = await openSafetyDb();
    });
    afterAll(async () => {
      await db?.close();
    });
    beforeEach(async () => {
      await db.pg.exec('delete from "user"');
      for (const id of ["owner", "prep", "reviewer"]) await db.seedUser(id);
      await db.sql`insert into firms(user_id,name) values ('owner','Test firm')`;
      await db.sql`insert into firm_members(firm_user_id,member_user_id,role)
      values ('owner','owner','owner'), ('owner','prep','preparer'), ('owner','reviewer','reviewer')`;
      await db.sql`insert into businesses(user_id,id,name,industry,profile,firm_user_id)
      values ('owner','biz_race','Race fixture','general','{}','owner')`;
      await executeControlCommand(db.sql, "prep", "biz_race", record);
    });
    for (const change of ["remove", "demote"] as const) {
      it(`rejects a reviewer ${change === "remove" ? "removed" : "demoted"} while waiting on the business lock`, async () => {
        const locked = signal();
        const release = signal();
        const tag = `control_${randomUUID().replaceAll("-", "")}`;
        const holder = inTransaction(db.sql, async (tx) => {
          await tx`select id from businesses where user_id='owner' and id='biz_race' for update`;
          locked.resolve();
          await release.promise;
          if (change === "remove")
            await tx`delete from firm_members where member_user_id='reviewer'`;
          else await tx`update firm_members set role='preparer' where member_user_id='reviewer'`;
        });
        await locked.promise;
        const outcome = executeControlCommand(
          taggedSql(db.sql, tag),
          "reviewer",
          "biz_race",
          review,
        ).then(
          (value) => ({ value, error: null }),
          (error) => ({ value: null, error }),
        );
        try {
          // Observe actual lock waiting, rather than trusting arbitrary sleeps.
          await expect
            .poll(
              async () => {
                const [row] = await db.sql<{ n: number }>`select count(*)::int as n
            from pg_stat_activity where query like ${`/* ${tag} */%`} and wait_event_type='Lock'`;
                return row.n;
              },
              { timeout: 5_000, interval: 20 },
            )
            .toBeGreaterThan(0);
        } finally {
          release.resolve();
          await holder;
        }
        const result = await outcome;
        expect(result.error).toMatchObject({ status: change === "remove" ? 404 : 403 });
        const [saved] = await db.sql<{
          revision: number;
        }>`select revision from control_execution_log
        where user_id='owner' and business_id='biz_race' and id='check'`;
        expect(saved.revision).toBe(1);
      });
    }

    for (const flow of ["control execution", "monthly review", "report lock"] as const) {
      it(`commits no ${flow} after a waiting engagement close`, async () => {
        const locked = signal();
        const release = signal();
        const closeTag = `close_${randomUUID().replaceAll("-", "")}`;
        const writeTag = `write_${randomUUID().replaceAll("-", "")}`;
        const closing = setEngagementStatus(
          pausedAfterBusinessLock(db.sql, closeTag, locked, release),
          "owner",
          "biz_race",
          "ended",
          "owner",
        );
        await locked.promise;
        const writerSql = taggedSql(db.sql, writeTag);
        const writing =
          flow === "control execution"
            ? executeControlCommand(writerSql, "prep", "biz_race", {
                ...record,
                runId: "after-close",
              })
            : flow === "monthly review"
              ? insertReviewEvent(
                  writerSql,
                  "owner",
                  {
                    businessId: "biz_race",
                    period: "2026-09",
                    itemKey: "bank_reconciliation",
                    ownerName: "Owner",
                    dueOn: null,
                    result: "done",
                    notes: "",
                  },
                  "prep",
                )
              : lockReportVersion(writerSql, {
                  ownerUserId: "owner",
                  businessId: "biz_race",
                  preparedBy: "prep",
                  scopeNote: "",
                  id: "rv_after_close",
                });
        const outcome = writing.then(
          (value) => ({ value, error: null }),
          (error) => ({ value: null, error }),
        );
        try {
          await expect
            .poll(
              async () => {
                const [row] = await db.sql<{ n: number }>`select count(*)::int as n
                  from pg_stat_activity
                  where query like ${`/* ${writeTag} */%`} and wait_event_type='Lock'`;
                return row.n;
              },
              { timeout: 5_000, interval: 20 },
            )
            .toBeGreaterThan(0);
        } finally {
          release.resolve();
          await closing;
        }
        expect((await outcome).error).toMatchObject({ status: 409 });
        const table =
          flow === "control execution"
            ? "control_execution_log"
            : flow === "monthly review"
              ? "review_events"
              : "report_versions";
        const [saved] = await db.sql.query<{ n: number }>(
          `select count(*)::int as n from ${table} where user_id=$1 and business_id=$2`,
          ["owner", "biz_race"],
        );
        expect(saved.n).toBe(flow === "control execution" ? 1 : 0);
      });
    }
  },
);
