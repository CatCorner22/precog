import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Sql } from "@/lib/db";
import { openTestDb, type TestDb } from "@/test/pglite";
import { loadActiveBusiness, saveBusinessRevision, setActiveBusiness } from "./business-store";
import { pioneerProfileFrom } from "./coach/pioneer-profile";
import { defaultProfile, normalizeProfile, type PracticeProfile } from "./practice-profile";
import { mergeProfile, mergeSections, sameValue, withAccountSections } from "./profile-merge";
import { validateProfileInput } from "./profile-input";
import { withMonthlyReviews, withPeople, withProcedure } from "./profile-actions";
import { newProcedure, newStep } from "./procedures/lifecycle";

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

describe("mergeProfile runs the client's normaliser", () => {
  it("clamps staff, maps an unknown industry to the default and drops a malformed entry", () => {
    const base = defaultProfile("restaurant");
    const served = mergeProfile(
      {
        name: "Corner Bistro",
        industry: "bogus",
        profile: {
          ...base,
          staff: { ...base.staff, teamSize: 99_999 },
          customPeople: [null] as unknown as PracticeProfile["customPeople"],
        },
      },
      TODAY,
    );
    expect(served.industry).toBe("dental");
    expect(served.practiceName).toBe("Corner Bistro");
    expect(served.staff.teamSize).toBe(500);
    expect(served.customPeople).toEqual([]);
  });
});

describe("merging edits two devices made on top of one version (PERF-8)", () => {
  const STAMP = "2026-09-23T12:00:00.000Z";

  /** The version both devices opened: an owner's own team, set up. */
  function opened(): PracticeProfile {
    const sample = defaultProfile("dental");
    const own = withPeople(
      {
        ...sample,
        businessId: "biz_merge",
        practiceName: "Smile Dental",
        onboardingComplete: true,
      },
      [
        { id: "p_owner", name: "Dana Reyes", role: "Owner", active: true, owner: true },
        { id: "p_front", name: "Sam Lee", role: "Front desk", active: true },
      ],
      TODAY,
    );
    return normalizeProfile(own, { today: TODAY });
  }

  /** Every object's keys in reverse order, as the database may hand them back. */
  function reordered(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(reordered);
    if (value === null || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([key, item]) => [key, reordered(item)]),
    );
  }

  /** The other device's save as the account's conflict reply hands it to this device. */
  function served(profile: PracticeProfile): PracticeProfile {
    const stored = reordered(JSON.parse(JSON.stringify(profile))) as PracticeProfile;
    const { ownerUserId: _routing, ...reply } = mergeProfile(
      { name: profile.practiceName, industry: profile.industry, profile: stored },
      TODAY,
    );
    return normalizeProfile({ ...reply, businessId: profile.businessId }, { today: TODAY });
  }

  const procedure = newProcedure(
    {
      industry: "dental",
      title: "Reconcile the checking account",
      steps: [newStep("Open Banking.")],
    },
    TODAY,
  );

  function addPerson(p: PracticeProfile, name: string): PracticeProfile {
    return {
      ...withPeople(
        p,
        [...(p.customPeople ?? []), { id: `p_${name}`, name, role: "Hygienist", active: true }],
        TODAY,
      ),
      updatedAt: `${TODAY}T10:00:00.000Z`,
    };
  }

  it("merges a team edit on this device with a procedure saved from another", () => {
    const base = opened();
    const local = addPerson(base, "Ari");
    const remote = served(withProcedure(base, procedure, TODAY));

    const merge = mergeSections(base, local, remote, STAMP);
    expect(merge.kind).toBe("merged");
    if (merge.kind !== "merged") return;
    expect(merge.fromRemote).toEqual(["procedures"]);
    // Both edits are kept: this device's team and the other device's procedure.
    expect(merge.profile.customPeople?.map((p) => p.name)).toEqual([
      "Dana Reyes",
      "Sam Lee",
      "Ari",
    ]);
    expect(merge.profile.staff).toEqual(local.staff);
    expect(merge.profile.procedures?.map((p) => p.id)).toEqual([procedure.id]);
    expect(merge.profile.businessId).toBe("biz_merge");
    expect(merge.profile.updatedAt).toBe(STAMP);
    // Every other section is this device's, as it was.
    for (const key of Object.keys(local) as (keyof PracticeProfile)[])
      if (key !== "procedures" && key !== "updatedAt")
        expect(sameValue(merge.profile[key], local[key]), key).toBe(true);
  });

  it("merges a monthly review saved elsewhere with a team edit made here", () => {
    const base = opened();
    const review = {
      key: "bank_statement" as const,
      period: "2026-08",
      result: "done" as const,
      ownerName: "Pat Kim",
      notes: "",
      recordedAt: `${TODAY}T09:00:00.000Z`,
    };
    const local = addPerson(base, "Ari");
    const remote = served(withMonthlyReviews(base, [review]));
    const merge = mergeSections(base, local, remote, STAMP);
    expect(merge.kind).toBe("merged");
    if (merge.kind !== "merged") return;
    expect(merge.fromRemote).toEqual(["monthlyReviews"]);
    expect(merge.profile.monthlyReviews).toEqual([review]);
    expect(merge.profile.customPeople?.map((p) => p.name)).toContain("Ari");
  });

  it("still asks when both devices edited the team", () => {
    const base = opened();
    const local = addPerson(base, "Ari");
    const remote = served(addPerson(base, "Bo"));
    expect(mergeSections(base, local, remote, STAMP)).toEqual({
      kind: "overlap",
      sections: ["team"],
    });
  });

  it("still asks when both devices edited the same procedure differently", () => {
    const base = opened();
    const here = withProcedure(base, procedure, TODAY);
    const there = served(
      withProcedure(base, { ...procedure, title: "Reconcile the savings account" }, TODAY),
    );
    expect(mergeSections(base, here, there, STAMP)).toEqual({
      kind: "overlap",
      sections: ["procedures"],
    });
  });

  it("takes the same change made on both devices once, without asking", () => {
    const base = opened();
    const local = withProcedure(base, procedure, TODAY);
    const remote = served(withProcedure(base, procedure, TODAY));
    const merge = mergeSections(base, local, remote, STAMP);
    expect(merge.kind).toBe("merged");
    if (merge.kind !== "merged") return;
    expect(merge.profile.procedures?.map((p) => p.id)).toEqual([procedure.id]);
  });

  it("keeps this device's identity and routing even when the reply omits it", () => {
    const base = { ...opened(), ownerUserId: "owner_1" };
    const local = addPerson(base, "Ari");
    const remote = served(withProcedure(base, procedure, TODAY));
    expect(remote.ownerUserId).toBeUndefined();
    const merge = mergeSections(base, local, remote, STAMP);
    expect(merge.kind === "merged" && merge.profile.ownerUserId).toBe("owner_1");
  });

  it("never merges across a change of industry", () => {
    const base = opened();
    const local = { ...addPerson(base, "Ari"), industry: "restaurant" as const };
    const remote = served(withProcedure(base, procedure, TODAY));
    expect(mergeSections(base, local, remote, STAMP).kind).toBe("overlap");
  });

  it("counts a key no section names as settings, so it is never dropped", () => {
    const base = opened();
    const local = { ...base, futureField: "here" } as PracticeProfile;
    const remote = { ...base, practiceName: "Smile Dental Group" };
    expect(mergeSections(base, local, remote, STAMP)).toEqual({
      kind: "overlap",
      sections: ["settings"],
    });
  });

  it("applies the merge to edits made since, unless they touched a section it takes", () => {
    const base = opened();
    const local = addPerson(base, "Ari");
    const remote = served(withProcedure(base, procedure, TODAY));
    const later = { ...local, practiceName: "Smile Dental Co" };
    const applied = withAccountSections(later, local, remote, ["procedures"], STAMP);
    expect(applied?.practiceName).toBe("Smile Dental Co");
    expect(applied?.procedures?.map((p) => p.id)).toEqual([procedure.id]);
    expect(applied?.customPeople?.map((p) => p.name)).toContain("Ari");
    expect(applied?.updatedAt).toBe(STAMP);

    const touched = withProcedure(local, { ...procedure, id: "proc_here" }, TODAY);
    expect(withAccountSections(touched, local, remote, ["procedures"], STAMP)).toBeNull();
    const other = { ...later, businessId: "biz_other" };
    expect(withAccountSections(other, local, remote, ["procedures"], STAMP)).toBeNull();
  });

  it("compares as the account stores JSON", () => {
    expect(sameValue({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true);
    expect(sameValue({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(sameValue({ a: null }, { a: undefined })).toBe(false);
    expect(sameValue([1, 2], [2, 1])).toBe(false);
    expect(sameValue({ a: [] }, { a: {} })).toBe(false);
  });
});
