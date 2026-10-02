import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { openTestDb, type TestDb } from "@/test/pglite";
import { loadFrozenReport, lockReportVersion } from "../firm/reports";
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
  type StoredReportModel,
} from "./stored-model";

const DAY = "2026-09-26";

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

  it("stores no model when the model is past the cap", () => {
    expect(freezeReport(defaultProfile("dental"), DAY, huge)).toEqual({
      scoringVersion: SCORING_VERSION,
      layoutVersion: REPORT_LAYOUT_VERSION,
      model: null,
    });
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
    expect(reviveReportModel(frozen!.model!)).toEqual(atLock);
  });

  it("records the versions, with no model, when the figures are past the cap", async () => {
    await lockReportVersion(db.sql, {
      ownerUserId: "owner",
      businessId: "biz_1",
      preparedBy: "owner",
      scopeNote: "",
      id: "rv_big",
      freeze: (profile) => freezeReport(profile, DAY, huge),
    });
    expect(await loadFrozenReport(db.sql, "owner", "rv_big")).toEqual({
      scoringVersion: SCORING_VERSION,
      layoutVersion: REPORT_LAYOUT_VERSION,
      model: null,
    });
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
