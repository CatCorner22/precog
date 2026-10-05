import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { inTransaction, toSql } from "@/lib/sql-transaction";
import type { Sql } from "@/lib/db";
import { openSafetyDb, type SafetyDb } from "@/test/safety-db";
import { deleteAccountRows, exportAccountRows } from "../../account-store";
import { executeControlCommand, listControlExecutions } from "./store";
let db: SafetyDb;
const record = (runId = "check_a") => ({
  action: "record",
  commandId: `command_${runId}`,
  runId,
  baseRevision: 0,
  controlKey: "bank_statement",
  period: "2026-08",
  performedOn: "2026-09-03",
  performedBy: "prep",
  method: "inspection",
  scope: "All statement lines for August",
  evidenceRefs: ["Restricted statement and reconciliation archive"],
  result: "no_exception",
  note: "Compared complete statement to books and unresolved items.",
});
const review = () => ({
  action: "review",
  commandId: "command_review",
  runId: "check_a",
  baseRevision: 1,
  method: "inspection",
  evidenceRefs: ["Review worksheet v1"],
  result: "no_exception",
  note: "Reviewed the independent statement and inspected the reconciliation.",
  independenceConfirmed: true,
});
beforeAll(async () => {
  db = await openSafetyDb();
});
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await db.pg.exec('delete from "user"');
  for (const id of ["owner", "prep", "reviewer", "outsider"]) await db.seedUser(id);
  await db.sql`insert into firms(user_id, name) values ('owner', 'Test firm')`;
  await db.sql`insert into firm_members(firm_user_id, member_user_id, role) values ('owner', 'owner', 'owner'), ('owner', 'prep', 'preparer'), ('owner', 'reviewer', 'reviewer')`;
  await db.sql`insert into businesses(user_id, id, name, industry, profile, revision, firm_user_id) values ('owner', 'biz_1', 'Client', 'general', '{}', 7, 'owner')`;
});
const run = (actor = "prep", command: unknown = record(), businessId = "biz_1") =>
  executeControlCommand(db.sql, actor, businessId, command);
describe("account-scoped control execution log", () => {
  it("refuses the shared development identity rather than recording it as a signed account", async () => {
    await expect(
      executeControlCommand(db.sql, "dev-user", "biz_1", record()),
    ).rejects.toMatchObject({ status: 401 });
  });
  it("stores server provenance, saved-business revision and a reviewable check", async () => {
    const result = await run();
    expect(result.status).toBe("awaiting_review");
    expect(result.sourceBusinessRevision).toBe(7);
    expect(result.history[0].actor.id).toBe("prep");
    expect(Number.isFinite(Date.parse(result.history[0].recordedAt))).toBe(true);
  });
  it("authorizes another firm reviewer and appends without rewriting the original", async () => {
    const first = await run();
    const next = await run("reviewer", review());
    expect(next.status).toBe("reviewed");
    expect(next.history[0]).toEqual(first.history[0]);
    expect(next.history[1].actor.id).toBe("reviewer");
  });
  it("refuses self-approval, firm preparer approval and outsider reads/writes", async () => {
    await run("owner");
    await expect(run("owner", review())).rejects.toMatchObject({ status: 403 });
    await expect(run("prep", review())).rejects.toMatchObject({ status: 403 });
    await expect(run("outsider", record("another"))).rejects.toMatchObject({ status: 404 });
    await expect(
      listControlExecutions(db.sql, "outsider", "biz_1", "2026-08", null),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("rechecks membership after removal", async () => {
    await run();
    await db.sql`delete from firm_members where member_user_id = 'reviewer'`;
    await expect(run("reviewer", review())).rejects.toMatchObject({ status: 404 });
  });
  it("never reads another owner's log when business IDs collide", async () => {
    await run();
    await db.sql`insert into businesses(user_id,id,name,industry,profile) values ('outsider','biz_1','Other','general','{}')`;
    expect(
      (await listControlExecutions(db.sql, "outsider", "biz_1", "2026-08", null)).entries,
    ).toEqual([]);
    await run("outsider");
    expect(
      (await listControlExecutions(db.sql, "owner", "biz_1", "2026-08", null)).entries[0].history[0]
        .actor.id,
    ).toBe("prep");
  });
  it("does not recreate missing or deleted businesses", async () => {
    await expect(run("owner", record(), "missing")).rejects.toMatchObject({ status: 404 });
    await run();
    await db.sql`update businesses set deleted_at=now() where id='biz_1'`;
    await expect(run("reviewer", review())).rejects.toMatchObject({ status: 404 });
    await expect(
      listControlExecutions(db.sql, "owner", "biz_1", "2026-08", null),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("is idempotent and refuses changes under an already used command", async () => {
    const before = await run();
    expect(await run()).toEqual(before);
    await expect(run("prep", { ...record(), note: "Changed" })).rejects.toMatchObject({
      status: 409,
    });
  });
  it("prevents an old reviewer from overwriting a newer conclusion", async () => {
    await run();
    const results = await Promise.allSettled([
      run("reviewer", review()),
      run("owner", { ...review(), commandId: "second_review" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const saved = (await listControlExecutions(db.sql, "owner", "biz_1", "2026-08", null))
      .entries[0];
    expect(saved.revision).toBe(2);
    expect(saved.history).toHaveLength(2);
  });
  it("preserves the record on a failed transition", async () => {
    const before = await run();
    await expect(run("reviewer", { ...review(), method: "inquiry" })).rejects.toThrow();
    expect(
      (await listControlExecutions(db.sql, "owner", "biz_1", "2026-08", null)).entries[0],
    ).toEqual(before);
  });
  it("returns an explicit empty period and validates pagination", async () => {
    await run();
    expect(
      (await listControlExecutions(db.sql, "owner", "biz_1", "2026-07", null)).entries,
    ).toEqual([]);
    await expect(
      listControlExecutions(db.sql, "owner", "biz_1", "2026-13", null),
    ).rejects.toThrow();
    await expect(
      listControlExecutions(db.sql, "owner", "biz_1", "2026-08", "bad cursor"),
    ).rejects.toThrow();
  });
  it("exports the full record and cascades hard business deletion", async () => {
    await run();
    const exported = await exportAccountRows(db.sql, "owner");
    expect(exported.controlExecutions).toHaveLength(1);
    expect(exported.controlExecutions[0].record.history[0].actor.id).toBe("prep");
    await db.sql`delete from businesses where user_id='owner' and id='biz_1'`;
    const rows = await db.sql`select * from control_execution_log`;
    expect(rows).toEqual([]);
  });
  it("deletes owned execution data on account deletion", async () => {
    await run();
    await deleteAccountRows(db.sql, "owner");
    expect(await db.sql`select * from control_execution_log`).toEqual([]);
  });
  it("reports pagination honestly and never drops the next page", async () => {
    for (let i = 0; i < 21; i += 1) await run("prep", record(`check_${i}`));
    const first = await listControlExecutions(db.sql, "reviewer", "biz_1", "2026-08", null);
    const second = await listControlExecutions(
      db.sql,
      "reviewer",
      "biz_1",
      "2026-08",
      first.nextCursor,
    );
    expect(first.entries).toHaveLength(20);
    expect(first.more).toBe(true);
    expect(second.entries).toHaveLength(1);
    expect(second.more).toBe(false);
    expect(new Set([...first.entries, ...second.entries].map((r) => r.id)).size).toBe(21);
  });
  it("checks a demoted reviewer's current role before accepting a conclusion", async () => {
    await run();
    await db.sql`update firm_members set role='preparer' where member_user_id='reviewer'`;
    await expect(run("reviewer", review())).rejects.toMatchObject({ status: 403 });
    expect(
      (await listControlExecutions(db.sql, "reviewer", "biz_1", "2026-08", null)).canReview,
    ).toBe(false);
  });
  it("rolls back a database write failure without adding an event", async () => {
    const before = await run();
    await db.pg.exec(`create function reject_control_write() returns trigger language plpgsql as $$
      begin raise exception 'injected write failure'; end; $$;
      create trigger reject_write before update on control_execution_log
      for each row execute function reject_control_write();`);
    try {
      await expect(run("reviewer", review())).rejects.toThrow("injected write failure");
      expect(
        (await listControlExecutions(db.sql, "owner", "biz_1", "2026-08", null)).entries[0],
      ).toEqual(before);
    } finally {
      await db.pg.exec(
        "drop trigger reject_write on control_execution_log; drop function reject_control_write();",
      );
    }
    expect((await run("reviewer", review())).status).toBe("reviewed");
  });
  it("rejects null provenance/identity fields at the database boundary", async () => {
    const first = await run();
    await expect(db.sql`update control_execution_log set record=${JSON.stringify({ ...first, status: null })}::jsonb
      where user_id='owner' and business_id='biz_1'`).rejects.toThrow();
  });
  it("stores the card statement check and still loads the four earlier keys", async () => {
    const keys = [
      "bank_statement",
      "cleared_checks",
      "payroll_headcount",
      "new_vendors",
      "card_statement",
    ];
    for (const controlKey of keys)
      await run("prep", { ...record(`check_${controlKey}`), controlKey });
    const listed = await listControlExecutions(db.sql, "owner", "biz_1", "2026-08", null);
    expect(listed.entries.map((r) => r.controlKey).sort()).toEqual([...keys].sort());
  });
  it("replaces the unnamed controlKey check with one named check that still refuses other keys", async () => {
    const saved = await run("prep", { ...record(), controlKey: "card_statement" });
    const checks = await db.sql<{ conname: string }>`select conname from pg_constraint
      where conrelid = 'control_execution_log'::regclass and contype = 'c'
        and pg_get_constraintdef(oid) like '%new_vendors%'`;
    expect(checks.map((c) => c.conname)).toEqual(["control_execution_log_control_key_check"]);
    await expect(db.sql`update control_execution_log set record=${JSON.stringify({ ...saved, controlKey: "petty_cash" })}::jsonb
      where user_id='owner' and business_id='biz_1'`).rejects.toThrow();
  });
  it("does not use membership of a different firm to authorize this business", async () => {
    await db.sql`insert into firms(user_id,name) values ('outsider','Other firm')`;
    await db.sql`insert into firm_members(firm_user_id,member_user_id,role) values ('outsider','outsider','owner')`;
    await expect(run("outsider")).rejects.toMatchObject({ status: 404 });
  });
  it("refuses ambiguous shared business IDs instead of choosing the wrong client", async () => {
    await db.sql`insert into firms(user_id,name) values ('outsider','Other firm')`;
    await db.sql`insert into firm_members(firm_user_id,member_user_id,role) values ('outsider','reviewer','reviewer')`;
    await db.sql`insert into businesses(user_id,id,name,industry,profile,firm_user_id) values ('outsider','biz_1','Other client','general','{}','outsider')`;
    await expect(run("reviewer")).rejects.toMatchObject({ status: 409 });
    await expect(
      listControlExecutions(db.sql, "reviewer", "biz_1", "2026-08", null),
    ).rejects.toMatchObject({ status: 409 });
  });
});

/** Deterministic interleaving injection, not a separate-connection concurrency test. */
function changingMembershipAtParentLock(mutate: (tx: Sql) => Promise<unknown>): Sql {
  const wrapped = toSql((text, values) => db.sql.query(text, values));
  wrapped.transaction = (work) =>
    inTransaction(db.sql, async (tx) => {
      let injected = false;
      const intercepted = toSql(async <T>(text: string, values: unknown[]): Promise<T[]> => {
        const rows = await tx.query<T>(text, values);
        if (!injected && /from businesses[\s\S]*for (?:update|share)/i.test(text)) {
          injected = true;
          await mutate(tx);
        }
        return rows;
      });
      return work(intercepted);
    });
  return wrapped;
}

describe("authorization after the parent lock (injected interleaving)", () => {
  it("does not retain the pre-lock reviewer role after demotion", async () => {
    const before = await run();
    const guarded = changingMembershipAtParentLock(
      (tx) => tx`update firm_members set role='preparer' where member_user_id='reviewer'`,
    );
    await expect(
      executeControlCommand(guarded, "reviewer", "biz_1", review()),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      (await listControlExecutions(db.sql, "owner", "biz_1", "2026-08", null)).entries[0],
    ).toEqual(before);
  });
  it("does not retain pre-lock membership after revocation", async () => {
    await run();
    const guarded = changingMembershipAtParentLock(
      (tx) => tx`delete from firm_members where member_user_id='reviewer'`,
    );
    await expect(
      executeControlCommand(guarded, "reviewer", "biz_1", review()),
    ).rejects.toMatchObject({ status: 404 });
  });
});
