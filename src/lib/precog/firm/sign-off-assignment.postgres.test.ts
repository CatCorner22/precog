import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Sql } from "@/lib/db";
import { inTransaction, toSql } from "@/lib/sql-transaction";
import { AUDIT_BYPASS_SQL } from "@/test/pglite";
import { openSafetyDb, type SafetyDb } from "@/test/safety-db";
import { saveEngagement } from "./engagement-store";
import { lockReportVersion, OVERRIDE_NOTE_REQUIRED, signOffReportVersion } from "./reports";

function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Every statement carries `tag`, so pg_stat_activity can say whether it waits on a lock. */
function taggedSql(sql: Sql, tag: string): Sql {
  const wrapped = toSql(<T>(text: string, params: unknown[]) =>
    sql.query<T>(`/* ${tag} */ ${text}`, params),
  );
  wrapped.transaction = (work) => inTransaction(sql, (tx) => work(taggedSql(tx, tag)));
  return wrapped;
}

/** Like taggedSql, and pauses the transaction just before the first statement matching `at`. */
function pausedBefore(
  sql: Sql,
  tag: string,
  at: RegExp,
  reached: ReturnType<typeof signal>,
  release: ReturnType<typeof signal>,
): Sql {
  const wrapped = toSql(<T>(text: string, params: unknown[]) =>
    sql.query<T>(`/* ${tag} */ ${text}`, params),
  );
  wrapped.transaction = (work) =>
    inTransaction(sql, (tx) => {
      let paused = false;
      const inner = toSql(async <T>(text: string, params: unknown[]) => {
        if (!paused && at.test(text)) {
          paused = true;
          reached.resolve();
          await release.promise;
        }
        return tx.query<T>(`/* ${tag} */ ${text}`, params);
      });
      inner.transaction = (nested) => nested(inner);
      return work(inner);
    });
  return wrapped;
}

const settle = <T>(p: Promise<T>) =>
  p.then(
    (value) => ({ value, error: null as unknown }),
    (error: unknown) => ({ value: null, error }),
  );

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

// A skip in the ordinary embedded suite is explicit; a real lock wait needs
// separate PostgreSQL connections.
describe.runIf(process.env.PRECOG_LIFECYCLE_POSTGRES === "1")(
  "real PostgreSQL: a review for issuance against a reassigned reviewer",
  () => {
    let db: SafetyDb;
    beforeAll(async () => {
      db = await openSafetyDb();
    }, 60_000);
    afterAll(async () => {
      await db?.close();
    });

    /** Firm `own` (owner, reviewers `rev` and `rev2`, preparer `prep`) with client `biz_1`. */
    beforeEach(async () => {
      await db.pg.exec(`begin; ${AUDIT_BYPASS_SQL} delete from "user"; commit;`);
      for (const id of ["own", "rev", "rev2", "prep"]) await db.seedUser(id);
      await db.pg.exec(`
        insert into firms (user_id, name) values ('own', 'North Advisors');
        insert into firm_members (firm_user_id, member_user_id, role) values
          ('own', 'own', 'owner'), ('own', 'rev', 'reviewer'),
          ('own', 'rev2', 'reviewer'), ('own', 'prep', 'preparer');
        insert into businesses (id, user_id, name, industry, profile, revision, firm_user_id) values
          ('biz_1', 'own', 'Client', 'general', '{}'::jsonb, 1, 'own');
      `);
      await assign(db.sql, "rev");
      await lockReportVersion(db.sql, {
        ownerUserId: "own",
        businessId: "biz_1",
        preparedBy: "prep",
        scopeNote: "",
        id: "rv_1",
      });
    });

    const assign = (sql: Sql, reviewerUserId: string) =>
      saveEngagement(sql, {
        ownerUserId: "own",
        businessId: "biz_1",
        actorUserId: "own",
        scope: "Monthly review",
        periodStart: "2026-09-01",
        periodEnd: "2026-09-30",
        preparerUserId: "prep",
        reviewerUserId,
      });

    const signOff = (sql: Sql, reviewedBy: string) =>
      signOffReportVersion(sql, { ownerUserId: "own", id: "rv_1", reviewedBy, note: "" });

    async function stored() {
      const [row] = await db.sql<{
        reviewed_by: string | null;
        review_override_note: string | null;
        reviewer_user_id: string | null;
      }>`
        select v.reviewed_by, v.review_override_note, e.reviewer_user_id
        from report_versions v
        join engagement_marks e on e.user_id = v.user_id and e.business_id = v.business_id
        where v.id = 'rv_1'
      `;
      return row;
    }

    /** Waits until the tagged statement waits on a lock, or `outcome` settled without waiting. */
    async function waitingOrDone(tag: string, outcome: Promise<unknown>) {
      let done = false;
      void outcome.then(() => {
        done = true;
      });
      await expect
        .poll(
          async () => {
            if (done) return true;
            const [row] = await db.sql<{ n: number }>`select count(*)::int as n
              from pg_stat_activity where query like ${`/* ${tag} */%`} and wait_event_type = 'Lock'`;
            return row.n > 0;
          },
          { timeout: 5_000, interval: 20 },
        )
        .toBe(true);
    }

    it("a reassignment started while the sign-off is past its read waits; the review stands on the assignment it read", async () => {
      const reached = signal();
      const release = signal();
      const tag = `assign_${randomUUID().replaceAll("-", "")}`;
      // rev's sign-off has read the assignment (rev) and pauses before its write.
      const signing = settle(
        signOff(pausedBefore(db.sql, "sign", /update report_versions/i, reached, release), "rev"),
      );
      await reached.promise;
      // The owner reassigns the client to rev2 meanwhile: it waits on the business row.
      const assigning = settle(assign(taggedSql(db.sql, tag), "rev2"));
      try {
        await waitingOrDone(tag, assigning);
      } finally {
        release.resolve();
      }
      const [signed, assigned] = [await signing, await assigning];
      expect(signed.error).toBeNull();
      expect(assigned.error).toBeNull();
      // rev reviewed as the assigned reviewer, with no override; rev2 is assigned from now on.
      expect(await stored()).toEqual({
        reviewed_by: "rev",
        review_override_note: null,
        reviewer_user_id: "rev2",
      });
    });

    it("a sign-off started while the reassignment is past its check waits, then needs the override", async () => {
      const reached = signal();
      const release = signal();
      const tag = `sign_${randomUUID().replaceAll("-", "")}`;
      // The reassignment to rev2 holds the business row and pauses before its write.
      const assigning = settle(
        assign(
          pausedBefore(db.sql, "assign", /insert into engagement_marks/i, reached, release),
          "rev2",
        ),
      );
      await reached.promise;
      // rev's sign-off waits for it, then reads rev2 as the assigned reviewer.
      const signing = settle(signOff(taggedSql(db.sql, tag), "rev"));
      try {
        await waitingOrDone(tag, signing);
      } finally {
        release.resolve();
      }
      const [assigned, signed] = [await assigning, await signing];
      expect(assigned.error).toBeNull();
      expect(message(signed.error)).toBe(OVERRIDE_NOTE_REQUIRED);
      expect(await stored()).toEqual({
        reviewed_by: null,
        review_override_note: null,
        reviewer_user_id: "rev2",
      });
    });
  },
);
