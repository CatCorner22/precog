import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clientErrorStatus } from "@/lib/request-errors";
import { openTestDb, type TestDb } from "@/test/pglite";
import { defaultProfile } from "./practice-profile";
import { buildAssignments } from "./sod/detect";
import { resolveTemplate } from "./active-template";
import {
  deleteSnapshot,
  insertSnapshot,
  listSnapshotSummaries,
  loadSnapshot,
  MAX_SNAPSHOTS_PER_ACCOUNT,
} from "./snapshot-store";

/** Runs against an embedded Postgres with every migration applied. */
let db: TestDb;

beforeAll(async () => {
  db = await openTestDb();
}, 60_000);

afterAll(() => db.close());

beforeEach(async () => {
  await db.clear("assessment_snapshots", '"user"');
  await db.seedUser("u1");
  await db.seedUser("u2");
});

const acme = { ...defaultProfile("dental"), businessId: "biz_acme", practiceName: "Acme Dental" };

describe("assessment_snapshots schema", () => {
  it("has the ownership, provenance and saved-work columns", async () => {
    const rows = await db.sql<{ column_name: string }>`
      select column_name from information_schema.columns
      where table_name = 'assessment_snapshots'`;
    expect(rows.map((r) => r.column_name)).toEqual(
      expect.arrayContaining([
        "id",
        "user_id",
        "profile_json",
        "model_version",
        "corpus_version",
        "created_at",
        "power_map_json",
        "value_case_json",
        "value_evidence_json",
      ]),
    );
  });
});

async function statusOf(run: () => Promise<unknown>): Promise<number | null> {
  try {
    await run();
  } catch (error) {
    return clientErrorStatus(error);
  }
  return null;
}

/** Fills the account up to `n` snapshots directly, oldest first. */
async function fill(userId: string, n: number) {
  for (let i = 0; i < n; i += 1) {
    await db.pg.query(
      `insert into assessment_snapshots (id, user_id, title, practice_name, profile_json, model_version, corpus_version, created_at)
       values ($1, $2, 'Old', 'Acme Dental', '{}'::jsonb, 'v', 'v', timestamptz '2026-01-01 00:00:00+00' + make_interval(mins => $3))`,
      [`snap_old_${i}`, userId, i],
    );
  }
}

describe("saving a snapshot", () => {
  it("says what it holds and which business it is of", async () => {
    const saved = await insertSnapshot(db.sql, "u1", {
      title: "Q3 review",
      profile: acme,
      powerMap: buildAssignments(resolveTemplate(acme)),
      valueCase: { directRecoveries: 100 },
    });
    expect(saved).toMatchObject({
      title: "Q3 review",
      practiceName: "Acme Dental",
      businessId: "biz_acme",
      includesPowerMap: true,
      includesValueProof: true,
    });
    const [listed] = await listSnapshotSummaries(db.sql, "u1");
    expect(listed).toEqual(saved);
    expect(listed.createdAt).toMatch(/^\d{4}-\d\d-\d\dT.*Z$/);
  });

  it("lists a snapshot without a power map or value proof as such", async () => {
    await insertSnapshot(db.sql, "u1", { title: "Bare", profile: acme });
    const [listed] = await listSnapshotSummaries(db.sql, "u1");
    expect(listed.includesPowerMap).toBe(false);
    expect(listed.includesValueProof).toBe(false);
  }, 60_000);

  it("refuses bad input with a 4xx, not a server failure", async () => {
    expect(await statusOf(() => insertSnapshot(db.sql, "u1", { title: "", profile: acme }))).toBe(
      400,
    );
    expect(await statusOf(() => insertSnapshot(db.sql, "u1", { title: "T", profile: 7 }))).toBe(
      400,
    );
    expect(
      await statusOf(() =>
        insertSnapshot(db.sql, "u1", { title: "T", profile: acme, powerMap: { nope: true } }),
      ),
    ).toBe(400);
  });

  it("refuses the save past the limit with 409 and the limit in the message", async () => {
    await fill("u1", MAX_SNAPSHOTS_PER_ACCOUNT);
    await expect(
      insertSnapshot(db.sql, "u1", { title: "One more", profile: acme }),
    ).rejects.toThrow(`Snapshot limit reached (${MAX_SNAPSHOTS_PER_ACCOUNT})`);
    expect(
      await statusOf(() => insertSnapshot(db.sql, "u1", { title: "One more", profile: acme })),
    ).toBe(409);
  }, 60_000);

  it("lets only one of two saves at once take the last place, and never drops the oldest", async () => {
    await fill("u1", MAX_SNAPSHOTS_PER_ACCOUNT - 1);
    const results = await Promise.allSettled([
      insertSnapshot(db.sql, "u1", { title: "Tab A", profile: acme }),
      insertSnapshot(db.sql, "u1", { title: "Tab B", profile: acme }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const ids = (
      await db.pg.query<{ id: string }>("select id from assessment_snapshots where user_id = 'u1'")
    ).rows.map((r) => r.id);
    expect(ids).toHaveLength(MAX_SNAPSHOTS_PER_ACCOUNT);
    expect(ids).toContain("snap_old_0");
  }, 60_000);
});

describe("reading and deleting", () => {
  it("never reads or deletes another account's snapshot", async () => {
    const saved = await insertSnapshot(db.sql, "u1", { title: "Mine", profile: acme });
    expect(await loadSnapshot(db.sql, "u2", saved.id)).toBeNull();
    expect(await deleteSnapshot(db.sql, "u2", saved.id)).toBe(false);
    expect(await deleteSnapshot(db.sql, "u1", saved.id)).toBe(true);
  });

  it("opens a snapshot whose stored power map no longer reads, without the map", async () => {
    const saved = await insertSnapshot(db.sql, "u1", { title: "Old build", profile: acme });
    await db.pg.query(
      `update assessment_snapshots set power_map_json = '{"broken": true}'::jsonb where id = $1`,
      [saved.id],
    );
    const loaded = await loadSnapshot(db.sql, "u1", saved.id);
    expect(loaded?.practiceName).toBe("Acme Dental");
    expect(loaded?.powerMap).toBeUndefined();
  });
});
