import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openSafetyDb, type SafetyDb } from "@/test/safety-db";
import { executeControlCommand, listControlExecutions } from "./store";
let db: SafetyDb;
const month = "2026-08";
beforeAll(async () => {
  db = await openSafetyDb();
  for (const id of ["owner", "other"]) {
    await db.seedUser(id);
    await db.sql`insert into businesses(user_id,id,name,industry,profile)
      values (${id},'biz_page', 'Pagination fixture', 'general','{}')`;
  }
});
afterAll(async () => {
  await db.close();
});
async function add(id: string, owner = "owner") {
  return executeControlCommand(db.sql, owner, "biz_page", {
    action: "record",
    commandId: `cmd_${id}`,
    runId: id,
    baseRevision: 0,
    controlKey: "bank_statement",
    period: month,
    performedOn: "2026-09-03",
    performedBy: "Recorded performer",
    method: "inspection",
    scope: "Stated August population",
    evidenceRefs: ["Restricted record"],
    result: "no_exception",
    note: "Compared source records.",
  });
}
describe("tenant-scoped stable log pagination", () => {
  it("does not repeat or omit old checks when a new check is added between pages", async () => {
    for (let i = 0; i < 21; i++) {
      const id = `page_${String(i).padStart(2, "0")}`;
      await add(id);
      // Identical timestamps exercise the id tie-breaker without clock assumptions.
      await db.sql`update control_execution_log set created_at='2026-09-03T12:00:00Z'
        where user_id='owner' and id=${id}`;
    }
    const first = await listControlExecutions(db.sql, "owner", "biz_page", month, null);
    expect(first.entries).toHaveLength(20);
    expect(first.more).toBe(true);
    expect(first.nextCursor).toBe(first.entries.at(-1)?.id);
    await add("new_after_page_one");
    const second = await listControlExecutions(
      db.sql,
      "owner",
      "biz_page",
      month,
      first.nextCursor,
    );
    expect(second.entries.map((r) => r.id)).toEqual(["page_00"]);
    expect(new Set([...first.entries, ...second.entries].map((r) => r.id)).size).toBe(21);
    expect(second.more).toBe(false);
    expect(second.nextCursor).toBeNull();
  });
  it("refuses an anchor belonging to a different account with the same business id", async () => {
    await add("other_anchor", "other");
    await expect(
      listControlExecutions(db.sql, "owner", "biz_page", month, "other_anchor"),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("refuses a valid anchor from a different period", async () => {
    await expect(
      listControlExecutions(db.sql, "owner", "biz_page", "2026-07", "page_00"),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("rejects malformed cursors and cannot interpret one as SQL", async () => {
    await expect(
      listControlExecutions(db.sql, "owner", "biz_page", month, "' OR 1=1 --"),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("shows an explicit empty first page without claiming no control gaps", async () => {
    const result = await listControlExecutions(db.sql, "owner", "biz_page", "2026-07", null);
    expect(result.entries).toEqual([]);
    expect(result.nextCursor).toBeNull();
    expect(result.more).toBe(false);
  });
});
