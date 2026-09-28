import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openTestDb, type TestDb } from "@/test/pglite";
import { saveBusinessRevision } from "../business-store";
import { serverUtcDay, shiftDay } from "../dates";
import { mergeProfile } from "../profile-merge";
import { parseSaveBusinessRequest } from "../profile-requests";
import { assertVerificationsAllowed, PREPARER_CANNOT_VERIFY } from "./verify-guard";

/**
 * The save path end to end on PGlite: the request parser stores procedures as
 * the app loads them, and the check reads that same list, so a procedure list
 * built to look different to the check and to the app cannot slip a
 * verification past it.
 */

const TODAY = serverUtcDay();
const FAR = "9999-01-01";

let db: TestDb;
beforeAll(async () => {
  db = await openTestDb();
  for (const id of ["owner", "preparer"]) await db.seedUser(id);
  await db.pg.query("insert into firms (user_id, name) values ('owner', 'Firm')");
  await db.pg.query(
    "insert into firm_members (firm_user_id, member_user_id, role) values ('owner','preparer','preparer')",
  );
  await db.pg.query(
    `insert into businesses (id, user_id, name, industry, profile, revision, firm_user_id)
     values ('biz_1', 'owner', 'Biz', 'general',
       '{"practiceName":"Biz","industry":"general","procedures":[]}'::jsonb, 1, 'owner')`,
  );
}, 60_000);
afterAll(() => db.close());

/** A procedure padded with far-future history, which the app drops on load. */
function filler(i: number) {
  return {
    id: `f${i}`,
    industry: "general",
    title: `Filler ${i}`,
    steps: [{ id: "s1", text: "Do it." }],
    changelog: Array.from({ length: 10 }, (_, k) => ({
      version: k + 1,
      on: FAR,
      summary: "x".repeat(120),
    })),
    proofs: Array.from({ length: 20 }, (_, k) => ({
      id: `p${k}`,
      personId: "person",
      on: FAR,
      note: "y".repeat(200),
    })),
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
}

const target = {
  id: "target",
  industry: "general",
  title: "Wire payments",
  steps: [{ id: "s1", text: "Send the payment." }],
  verifiedAt: TODAY,
  lastVerifiedAt: TODAY,
  verifiedBy: "owner",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
};

async function saveAsPreparer(procedures: unknown[]) {
  const data = parseSaveBusinessRequest({
    expectedAccountId: "preparer",
    profile: { practiceName: "Biz", industry: "general", businessId: "biz_1", procedures },
    baseRevision: 1,
    today: TODAY,
  });
  return {
    data,
    save: () =>
      saveBusinessRevision(db.sql, {
        userId: "owner",
        businessId: "biz_1",
        name: "Biz",
        industry: "general",
        profileJson: data.json,
        baseRevision: 1,
        savedBy: "preparer",
        firmUserId: "owner",
        checkWrite: (previous) =>
          assertVerificationsAllowed({
            previousProfile: previous,
            nextProfile: data.profile,
            saverId: "preparer",
            saverRole: "preparer",
            saverNames: [],
            latestDay: data.latestDay,
          }),
      }),
  };
}

describe("a verification cannot be slipped past the check on the save path", () => {
  it("refuses one hidden behind procedures padded to move the size limit", async () => {
    const { save } = await saveAsPreparer([
      ...Array.from({ length: 100 }, (_, i) => filler(i)),
      target,
    ]);
    await expect(save()).rejects.toThrow(PREPARER_CANNOT_VERIFY);
    const [row] = await db.sql<{ revision: number | string }>`
      select revision from businesses where user_id = 'owner' and id = 'biz_1'`;
    expect(Number(row.revision)).toBe(1);
  }, 60_000);

  it("stores exactly what the app will show, and never a date after tomorrow", async () => {
    const future = { ...target, id: "later", verifiedAt: shiftDay(TODAY, 30) };
    const { data } = await saveAsPreparer([filler(1), future]);
    const stored = JSON.parse(data.json) as { procedures: { id: string; verifiedAt?: string }[] };
    expect(stored.procedures.find((p) => p.id === "later")?.verifiedAt).toBeUndefined();
    const shown = mergeProfile(
      { profile: JSON.parse(data.json), name: "Biz", industry: "general" } as never,
      TODAY,
    ).procedures;
    expect((shown ?? []).map((p) => p.id)).toEqual(stored.procedures.map((p) => p.id));
  });
});
