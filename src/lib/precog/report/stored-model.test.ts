import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { largeBusinessProfile } from "@/test/large-business";
import { openTestDb, type TestDb } from "@/test/pglite";
import { loadFrozenReport, lockReportVersion, REPORT_TOO_LARGE_MESSAGE } from "../firm/reports";
import { INDUSTRIES } from "../industry";
import { defaultProfile } from "../practice-profile";
import { SCORING_VERSION } from "../scoring/weights";
import type { ControlReportModel } from "./build-control-report";
import {
  buildReportModelForProfile,
  freezeReport,
  REPORT_LAYOUT_VERSION,
  REPORT_MODEL_MAX_CHARS,
  reviveReportModel,
  serializeReportModel,
  slimReportModel,
  STORED_BACKUPS_PER_ITEM,
  type StoredReportModel,
} from "./stored-model";

const DAY = "2026-09-26";

/** The full model a lock builds for a stored profile, before it is slimmed. */
function modelFor(raw: Record<string, unknown>): ControlReportModel {
  let built: ControlReportModel | undefined;
  freezeReport(raw, DAY, (profile, today) => (built = buildReportModelForProfile(profile, today)));
  return built!;
}

const huge = (): ControlReportModel => ({
  ...buildReportModelForProfile(defaultProfile("dental"), DAY),
  summary: ["x".repeat(REPORT_MODEL_MAX_CHARS)],
});

describe("stored report model", () => {
  it.each(INDUSTRIES.map((i) => i.id))(
    "%s sample: survives JSON exactly and fits under the cap",
    (industry) => {
      const model = buildReportModelForProfile(defaultProfile(industry), DAY);
      const json = JSON.stringify(serializeReportModel(model));
      expect(json.length).toBeLessThan(REPORT_MODEL_MAX_CHARS);
      // toEqual tells a Map from a plain object and NaN from null, so a
      // non-JSON value added to the model later fails here.
      expect(reviveReportModel(JSON.parse(json) as StoredReportModel)).toEqual(model);
    },
  );

  it("stores no model, and marks it too large, when the model is past the cap", () => {
    expect(freezeReport(defaultProfile("dental"), DAY, huge)).toEqual({
      scoringVersion: SCORING_VERSION,
      layoutVersion: REPORT_LAYOUT_VERSION,
      model: null,
      tooLarge: true,
    });
  });

  it("stores each object the model repeats once, and revives it exactly", () => {
    const model = buildReportModelForProfile(defaultProfile("dental"), DAY);
    const stored = serializeReportModel(model);
    expect(stored.refs?.length).toBeGreaterThan(0);
    expect(JSON.stringify(stored)).toContain('{"$ref":');
    expect(reviveReportModel(JSON.parse(JSON.stringify(stored)) as StoredReportModel)).toEqual(
      model,
    );
  });

  it("keeps each person's printed fields and the first three suggested stand-ins", () => {
    const model = modelFor(largeBusinessProfile({ people: 20, register: 120, procedures: 100 }));
    const slim = slimReportModel(model);
    const row = model.continuity.items.findIndex(
      (item) => item.suggestedBackups.length > STORED_BACKUPS_PER_ITEM,
    );
    expect(row).toBeGreaterThanOrEqual(0);
    const kept = slim.continuity.items[row].suggestedBackups;
    expect(kept).toHaveLength(STORED_BACKUPS_PER_ITEM);
    expect(kept.map((b) => [b.person.id, b.person.name, b.reasons[0]])).toEqual(
      model.continuity.items[row].suggestedBackups
        .slice(0, STORED_BACKUPS_PER_ITEM)
        .map((b) => [b.person.id, b.person.name, b.reasons[0]]),
    );
    expect(Object.keys(kept[0].person).sort()).toEqual(["active", "id", "name", "role"]);
    expect(Object.keys(slim.continuity.people[0].person).sort()).toEqual([
      "active",
      "id",
      "name",
      "role",
    ]);
    // Everything else is unchanged.
    expect(slim.summary).toEqual(model.summary);
    expect(slim.sod.summary).toEqual(model.sod.summary);
    expect(slim.continuity.coverageIndex).toBe(model.continuity.coverageIndex);
  });

  // ST-SCALE-1: an own team of 10 people with a real register built 1.7 MB
  // and 60 people 2.9 MB, past the 1 MB cap, so the lock kept no figures.
  it.each([
    { people: 15, register: 80, procedures: 30 },
    { people: 15, register: 120, procedures: 100 },
    { people: 20, register: 120, procedures: 100 },
    { people: 60, register: 120, procedures: 100 },
  ])(
    "stores the figures of an own team of $people people, $register register items and $procedures procedures",
    (size) => {
      const raw = largeBusinessProfile(size);
      const frozen = freezeReport(raw, DAY);
      expect(frozen.tooLarge).toBeUndefined();
      expect(frozen.model).not.toBeNull();
      expect(JSON.stringify(frozen.model).length).toBeLessThan(REPORT_MODEL_MAX_CHARS);
      const revived = reviveReportModel(
        JSON.parse(JSON.stringify(frozen.model)) as StoredReportModel,
      );
      expect(revived).toEqual(slimReportModel(modelFor(raw)));
    },
  );

  it("marks a 400-person team with a full register too large to store", () => {
    const frozen = freezeReport(
      largeBusinessProfile({ people: 400, register: 120, procedures: 100 }),
      DAY,
    );
    expect(frozen.model).toBeNull();
    expect(frozen.tooLarge).toBe(true);
  });

  it("stores no model, and does not throw, when the model fails to build", () => {
    const broken = (): ControlReportModel => {
      throw new Error("boom");
    };
    expect(freezeReport(defaultProfile("dental"), DAY, broken).model).toBeNull();
  });
});

describe("locked version figures", () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await openTestDb();
  }, 60_000);

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.clear("report_versions", "businesses", '"user"');
    await db.seedUser("owner");
    await db.pg.query(
      `insert into businesses (id, user_id, name, industry, profile, revision)
       values ('biz_1', 'owner', 'Client', 'dental', $1::jsonb, 1)`,
      [JSON.stringify(defaultProfile("dental"))],
    );
  });

  it("reloads the figures it was locked with", async () => {
    await lockReportVersion(db.sql, {
      ownerUserId: "owner",
      businessId: "biz_1",
      preparedBy: "owner",
      scopeNote: "",
      id: "rv_1",
      freeze: (profile) => freezeReport(profile, DAY),
    });
    const atLock = buildReportModelForProfile(defaultProfile("dental"), DAY);
    const frozen = await loadFrozenReport<StoredReportModel>(db.sql, "owner", "rv_1");
    expect(frozen?.scoringVersion).toBe(SCORING_VERSION);
    expect(frozen?.layoutVersion).toBe(REPORT_LAYOUT_VERSION);
    expect(reviveReportModel(frozen!.model!)).toEqual(slimReportModel(atLock));
  });

  it("stores the figures of a 20-person team with a full register", async () => {
    const raw = largeBusinessProfile({ people: 20, register: 120, procedures: 100 });
    await db.pg.query(`update businesses set profile = $1::jsonb where id = 'biz_1'`, [
      JSON.stringify(raw),
    ]);
    const version = await lockReportVersion(db.sql, {
      ownerUserId: "owner",
      businessId: "biz_1",
      preparedBy: "owner",
      scopeNote: "",
      id: "rv_team",
      freeze: (profile) => freezeReport(profile, DAY),
    });
    expect(version.hasFigures).toBe(true);
    const frozen = await loadFrozenReport<StoredReportModel>(db.sql, "owner", "rv_team");
    expect(reviveReportModel(frozen!.model!)).toEqual(slimReportModel(modelFor(raw)));
  });

  it("refuses the lock, and stores no version, when the figures are past the cap", async () => {
    await expect(
      lockReportVersion(db.sql, {
        ownerUserId: "owner",
        businessId: "biz_1",
        preparedBy: "owner",
        scopeNote: "",
        id: "rv_big",
        freeze: (profile) => freezeReport(profile, DAY, huge),
      }),
    ).rejects.toMatchObject({ status: 413, message: REPORT_TOO_LARGE_MESSAGE });
    const rows = await db.sql<{ n: number }>`select count(*)::int as n from report_versions`;
    expect(rows[0].n).toBe(0);
  });

  it("a version locked before figures were stored has none", async () => {
    await lockReportVersion(db.sql, {
      ownerUserId: "owner",
      businessId: "biz_1",
      preparedBy: "owner",
      scopeNote: "",
      id: "rv_old",
    });
    expect(await loadFrozenReport(db.sql, "owner", "rv_old")).toBeNull();
    const row = await db.sql<{ scoring_version: string | null; layout_version: number | null }>`
      select scoring_version, layout_version from report_versions where id = 'rv_old'
    `;
    expect(row[0]).toEqual({ scoring_version: null, layout_version: null });
  });
});
