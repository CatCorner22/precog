import { describe, expect, it } from "vitest";
import { RequestError } from "../request-errors";
import { resolveTemplate } from "./active-template";
import { ownSetupProfile } from "./business-lifecycle";
import { defaultProfile, type MapVersion, type PracticeProfile } from "./practice-profile";
import {
  parseSnapshotCreate,
  parseSnapshotId,
  restoredProfile,
  sanitizeSnapshotProfile,
  snapshotSlice,
} from "./snapshot-profile";
import { buildAssignments } from "./sod/detect";
import { normalizeRoleAssignments } from "./sod/model-io";
import { getIndustryTemplate } from "./templates";
import type { Person } from "./types";

const TITLES = ["General Manager", "Bookkeeper", "Server", "Bartender", "Line Cook", "Host"];

/** An owner's restaurant as setup leaves it, then edited: 22 people, own map, register and leave. */
function ownRestaurant(): PracticeProfile {
  const people: Person[] = Array.from({ length: 22 }, (_, i) => ({
    id: `own-${i + 1}`,
    name: `Person ${i + 1}`,
    role: TITLES[i % TITLES.length],
    active: true,
    tenureYears: 1 + (i % 9),
    department: "Ember Street Tavern - Downtown",
    entitlements: i === 0 ? ["approve_payroll", "approve_vendor"] : ["collect_cash"],
  }));
  const setUp = ownSetupProfile({
    industry: "restaurant",
    practiceName: "Ember Street Tavern",
    people,
  });
  const tpl = resolveTemplate(setUp);
  const [first, ...rest] = tpl.processes;
  return {
    ...setUp,
    customProcesses: [
      { ...first, name: "Service & floor ops", ownerPersonIds: ["own-1"] },
      ...rest,
    ],
    customKnowledge: tpl.knowledge.slice(0, 3),
    customRelations: [{ personId: "own-2", knowledgeId: tpl.knowledge[0].id, level: "expert" }],
    plannedAbsences: [
      {
        id: "abs_1",
        personId: "own-3",
        industry: "restaurant",
        from: "2026-10-01",
        to: "2026-10-05",
      },
    ],
    mapLayout: { [first.id]: { x: 120, y: 80 } },
  };
}

/** Save through the server's sanitizer, read back through it, then restore on the client. */
function roundTrip(saved: PracticeProfile, current: PracticeProfile) {
  const created = sanitizeSnapshotProfile(snapshotSlice(saved));
  const got = sanitizeSnapshotProfile(JSON.parse(created.json));
  const powerMap = normalizeRoleAssignments(
    JSON.parse(JSON.stringify(buildAssignments(resolveTemplate(saved)))),
  );
  return restoredProfile(
    { profile: got.profile, powerMap, profileComplete: got.complete },
    current,
  );
}

describe("restoring an owner's snapshot", () => {
  it("brings back the owner's own business, never the dental sample", () => {
    const owner = ownRestaurant();
    const restored = roundTrip(owner, owner);
    expect(restored).not.toBeNull();
    if (!restored) return;
    expect(restored.industry).toBe("restaurant");
    expect(restored.practiceName).toBe("Ember Street Tavern");
    const dental = new Set(getIndustryTemplate("dental").people.map((p) => p.name));
    const people = restored.customPeople ?? [];
    expect(people.filter((p) => dental.has(p.name))).toEqual([]);
    expect(people.map((p) => p.name)).toEqual((owner.customPeople ?? []).map((p) => p.name));
    expect(people[0]).toMatchObject({
      tenureYears: 1,
      department: "Ember Street Tavern - Downtown",
    });
    expect(resolveTemplate(restored).processes[0].name).toBe("Service & floor ops");
    expect(restored.customKnowledge?.map((k) => k.id)).toEqual(
      owner.customKnowledge?.map((k) => k.id),
    );
    expect(restored.customRelations).toEqual(owner.customRelations);
    expect(restored.plannedAbsences).toEqual(owner.plannedAbsences);
    expect(restored.mapLayout).toEqual(owner.mapLayout);
  });

  it("replaces the open business's contents and keeps its id and map versions", () => {
    const owner = ownRestaurant();
    const version: MapVersion = {
      id: "ver_1",
      name: "Before the reorg",
      createdAt: "2026-09-01T00:00:00Z",
      healthScore: 70,
      processes: [],
      people: [],
      layout: {},
    };
    const open: PracticeProfile = {
      ...owner,
      businessId: "biz_open_now",
      practiceName: "Ember Street Tavern (renamed since)",
      mapVersions: [version],
    };
    const restored = roundTrip({ ...owner, businessId: "biz_other" }, open);
    expect(restored?.businessId).toBe("biz_open_now");
    expect(restored?.mapVersions).toEqual([version]);
    expect(restored?.practiceName).toBe("Ember Street Tavern");
  });

  it("keeps a sample snapshot the sample", () => {
    const sample = defaultProfile("retail");
    const restored = roundTrip(sample, ownRestaurant());
    expect(restored?.industry).toBe("retail");
    expect(restored?.customPeople).toBeNull();
  });

  it("refuses a snapshot saved before snapshots kept the business", () => {
    const legacy = sanitizeSnapshotProfile({
      practiceName: "Ember Street Tavern",
      staff: ownRestaurant().staff,
      decisions: [],
    });
    expect(legacy.complete).toBe(false);
    expect(
      restoredProfile({ profile: legacy.profile, profileComplete: false }, ownRestaurant()),
    ).toBeNull();
  });
});

describe("saving a snapshot for an owner with saved map versions", () => {
  it("is not refused for fields the snapshot does not keep", () => {
    const owner = ownRestaurant();
    const tpl = resolveTemplate(owner);
    const versions: MapVersion[] = Array.from({ length: 12 }, (_, i) => ({
      id: `ver_${i}`,
      name: `Version ${i}`,
      createdAt: "2026-09-01T00:00:00Z",
      healthScore: 60 + i,
      processes: tpl.processes,
      people: tpl.people,
      layout: {},
    }));
    const full = { ...owner, mapVersions: versions };
    expect(new TextEncoder().encode(JSON.stringify(full)).byteLength).toBeGreaterThan(128 * 1024);
    // An older client sends the whole profile; a current one sends the slice.
    for (const sent of [full, snapshotSlice(full)]) {
      const { json } = sanitizeSnapshotProfile(sent);
      expect(JSON.parse(json).mapVersions).toEqual([]);
    }
  });

  it("drops list entries that are not well formed instead of storing them", () => {
    const { profile } = sanitizeSnapshotProfile({
      ...snapshotSlice(ownRestaurant()),
      customPeople: [
        null,
        5,
        { name: "No id", role: "Server" },
        { id: "own-1", name: "A", role: "B" },
      ],
    });
    expect(profile.customPeople?.map((p) => p.id)).toEqual(["own-1"]);
  });
});

describe("snapshot requests with missing or malformed input", () => {
  it("answer 400 instead of failing with a TypeError", () => {
    for (const bad of [null, undefined, 5, "x", []]) {
      expect(() => parseSnapshotId(bad)).toThrow(RequestError);
      expect(() => parseSnapshotCreate(bad)).toThrow(RequestError);
    }
    try {
      parseSnapshotId(null);
    } catch (error) {
      expect((error as RequestError).status).toBe(400);
    }
  });

  it("read well-formed input as before", () => {
    expect(parseSnapshotId({ id: "snap_1" })).toEqual({ id: "snap_1" });
    expect(parseSnapshotCreate({ title: "  Q3  ", profile: {} })).toMatchObject({
      title: "Q3",
      profile: {},
    });
  });
});
