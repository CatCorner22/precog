import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Sql } from "@/lib/db";
import { openTestDb, type TestDb } from "@/test/pglite";
import { loadActiveBusiness, saveBusinessRevision, setActiveBusiness } from "./business-store";
import { pioneerProfileFrom } from "./coach/pioneer-profile";
import { defaultProfile, normalizeProfile, type PracticeProfile } from "./practice-profile";
import { mergeProfile } from "./profile-merge";
import { validateProfileInput } from "./profile-input";

/**
 * The server half of the manual-override round trip: what the client saves
 * with `segregationSource` / `bankRecSource` set must come back from the
 * cloud load, the conflict reply and the Pioneer input with the markers
 * intact, and the client's normaliser must keep them too.
 */

let db: TestDb;
let pg: PGlite;
let sql: Sql;

beforeAll(async () => {
  db = await openTestDb();
  pg = db.pg;
  sql = db.sql;
}, 60_000);

afterAll(() => db.close());

beforeEach(async () => {
  await pg.exec('delete from businesses; delete from business_profiles; delete from "user";');
  await pg.query(
    `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
     values ('u1', 'u1', 'u1@example.test', true, now(), now())`,
  );
});

const TODAY = "2026-09-23";

function manualProfile(): PracticeProfile {
  const base = defaultProfile("restaurant");
  return {
    ...base,
    practiceName: "Corner Bistro",
    businessId: "biz_bistro",
    staff: {
      ...base.staff,
      segregationScore: 80,
      segregationSource: "manual",
      independentBankRec: true,
      bankRecSource: "manual",
    },
  };
}

async function save(profile: PracticeProfile, baseRevision: number | null) {
  const checked = validateProfileInput(profile);
  const input = {
    userId: "u1",
    businessId: checked.businessId,
    name: profile.practiceName,
    industry: profile.industry,
    profileJson: checked.json,
  };
  const saved = await saveBusinessRevision<PracticeProfile>(sql, { ...input, baseRevision });
  if (saved.ok) await setActiveBusiness(sql, input);
  return saved;
}

describe("manual staff markers through the server", () => {
  it("survive save, cloud load and the client normaliser", async () => {
    expect((await save(manualProfile(), null)).ok).toBe(true);
    const active = await loadActiveBusiness<PracticeProfile>(sql, "u1");
    expect(active).not.toBeNull();
    const served = mergeProfile(active!, TODAY);
    expect(served.staff.segregationScore).toBe(80);
    expect(served.staff.segregationSource).toBe("manual");
    expect(served.staff.bankRecSource).toBe("manual");

    const onClient = normalizeProfile(served);
    expect(onClient.staff.segregationSource).toBe("manual");
    expect(onClient.staff.bankRecSource).toBe("manual");
    expect(onClient.staff.segregationScore).toBe(80);
  });

  it("survive the conflict reply a stale save receives", async () => {
    await save(manualProfile(), null);
    const stale = await save({ ...manualProfile(), practiceName: "Other tab" }, null);
    expect(stale.ok).toBe(false);
    if (stale.ok) return;
    const served = mergeProfile(stale.existing, TODAY);
    expect(served.staff.segregationSource).toBe("manual");
    expect(served.staff.bankRecSource).toBe("manual");
  });

  it("stay derived when the owner never overrode them", async () => {
    const base = defaultProfile("restaurant");
    await save(
      {
        ...base,
        businessId: "biz_derived",
        staff: { ...base.staff, segregationSource: "derived", bankRecSource: "derived" },
      },
      null,
    );
    const served = mergeProfile((await loadActiveBusiness<PracticeProfile>(sql, "u1"))!, TODAY);
    expect(served.staff.segregationSource).toBe("derived");
    expect(served.staff.bankRecSource).toBe("derived");
  });

  it("reach Pioneer's server-side profile", () => {
    const profile = pioneerProfileFrom({ industry: "restaurant", staff: manualProfile().staff });
    expect(profile.staff.segregationSource).toBe("manual");
    expect(profile.staff.bankRecSource).toBe("manual");
  });
});
