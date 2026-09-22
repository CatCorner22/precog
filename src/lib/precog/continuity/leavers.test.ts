import { describe, expect, it } from "vitest";
import { getBaseTemplate } from "../active-template";
import type { DecisionEntry } from "../practice-profile";
import type { IndustryTemplate } from "../templates/types";
import type { KnowledgeItem, KnowledgeRelation, Person } from "../types";
import {
  canMarkLeft,
  describeLeaver,
  handoverDeadline,
  leaverLead,
  leavers,
  markLeft,
  setLastDay,
} from "./leavers";

const people: Person[] = [
  { id: "maya", name: "Maya Chen", role: "Office manager", active: true, lastDay: "2026-10-14" },
  { id: "chris", name: "Chris Diaz", role: "Assistant", active: true },
  { id: "sam", name: "Sam Roy", role: "Hygienist", active: true },
  { id: "dee", name: "Dee Old", role: "Former staff", active: false, lastDay: "2026-01-01" },
];

function item(id: string, extra: Partial<KnowledgeItem> = {}): KnowledgeItem {
  return {
    id,
    name: id,
    criticality: "critical",
    category: "process",
    description: "",
    linkedProcessIds: [],
    ...extra,
  };
}

function tpl(relations: KnowledgeRelation[], team = people): IndustryTemplate {
  return {
    ...getBaseTemplate("general"),
    people: team,
    knowledge: [item("pms"), item("billing"), item("vendors", { documented: true })],
    relations,
    processes: [
      {
        ...getBaseTemplate("general").processes[0],
        id: "proc-1",
        name: "Month-end close",
        ownerPersonIds: ["maya"],
      },
    ],
  };
}

// PMS: only Maya, Chris learning. Billing: Maya and Sam both can. Vendors: only Maya, nobody else touched it.
const register = tpl([
  { personId: "maya", knowledgeId: "pms", level: "expert" },
  { personId: "chris", knowledgeId: "pms", level: "basic" },
  { personId: "maya", knowledgeId: "billing", level: "proficient" },
  { personId: "sam", knowledgeId: "billing", level: "proficient" },
  { personId: "maya", knowledgeId: "vendors", level: "expert" },
]);

function decision(overrides: Partial<DecisionEntry>): DecisionEntry {
  return {
    id: "d1",
    createdAt: "2026-09-20T10:00:00Z",
    subject: "pms",
    kind: "remediate",
    note: "",
    linkedTab: "knowledge",
    linkedId: "pms",
    linkedIndustry: "general",
    linkedStep: "cover",
    reviewBy: "2026-10-14",
    ...overrides,
  };
}

describe("leavers", () => {
  it("lists what only the leaver can run, who takes it over, and what still needs logging", () => {
    const [maya, ...rest] = leavers(register, [], "2026-10-02");
    expect(rest).toEqual([]);
    expect(maya.person.id).toBe("maya");
    expect(maya.daysLeft).toBe(12);
    expect(maya.status).toBe("notice");
    expect(maya.handover.map((h) => h.item.id)).toEqual(["pms", "vendors"]);
    expect(maya.handover[0].successor?.id).toBe("chris");
    expect(maya.handover[0].successorLevel).toBe("basic");
    expect(maya.handover[1].successor?.id).toBeDefined();
    expect(maya.shared.map((k) => k.id)).toEqual(["billing"]);
    expect(maya.orphanedProcesses).toEqual(["Month-end close"]);
    expect(maya.remaining.map((p) => p.id)).toEqual(["chris", "sam"]);
    expect(maya.unlogged).toBe(2);
    expect(maya.actions.map((a) => a.step)).toEqual(["cover", "document", "locate", "cover"]);
    expect(maya.actions[0].text).toContain('Chris Diaz on "pms"');
    expect(maya.actions[1].text).toContain('write down "pms"');
    expect(maya.actions[2].knowledgeIds).toEqual(["vendors"]);
    expect(maya.actions[3].text).toContain("Month-end close");
  });

  it("skips people who have already left, and people with no last day", () => {
    const none = tpl(
      register.relations,
      people.map((p) => ({ ...p, lastDay: undefined })),
    );
    expect(leavers(none, [], "2026-10-02")).toEqual([]);
    expect(leavers(register, [], "2026-10-02").some((l) => l.person.id === "dee")).toBe(false);
  });

  it("reads open cross-training and write-it-down steps from the Journal", () => {
    const [maya] = leavers(
      register,
      [
        decision({}),
        decision({ id: "d2", linkedStep: "document", subject: "vendors", linkedId: "vendors" }),
        decision({ id: "d3", linkedId: "pms", status: "closed" }),
      ],
      "2026-10-02",
    );
    expect(maya.handover[0].training?.id).toBe("d1");
    expect(maya.handover[0].documenting).toBeNull();
    expect(maya.handover[1].training).toBeNull();
    expect(maya.handover[1].documenting?.id).toBe("d2");
    expect(maya.unlogged).toBe(1);
  });

  it("turns into 'gone' once the last day has passed but the person is still active", () => {
    const [maya] = leavers(register, [], "2026-10-17");
    expect(maya.status).toBe("gone");
    expect(maya.daysLeft).toBe(-3);
    expect(describeLeaver(maya)).toBe(
      "Maya left 3 days ago (last day 14 Oct) and is still counted as on the team — mark Maya as left so the register stops relying on Maya for 2 entries.",
    );
    expect(handoverDeadline(maya, "2026-10-17")).toBe("2026-10-17");
  });

  it("describes the hand-over in one sentence", () => {
    const [maya] = leavers(register, [decision({})], "2026-10-02");
    expect(describeLeaver(maya)).toBe(
      "Maya leaves in 12 days (last day 14 Oct): 2 register entries only Maya can run alone — train Chris on pms — train Chris on vendors — 1 process needs a new owner; 1 of 2 logged in the Journal.",
    );
    expect(handoverDeadline(maya, "2026-10-02")).toBe("2026-10-14");
    expect(leaverLead(0)).toBe("last day today");
    expect(leaverLead(1)).toBe("leaves tomorrow");
    expect(leaverLead(-1)).toBe("left yesterday");
  });

  it("says so when nothing leaves with them", () => {
    const covered = tpl([
      { personId: "maya", knowledgeId: "billing", level: "proficient" },
      { personId: "sam", knowledgeId: "billing", level: "proficient" },
    ]);
    covered.processes = [];
    const [maya] = leavers(covered, [], "2026-10-02");
    expect(maya.handover).toEqual([]);
    expect(maya.actions).toHaveLength(1);
    expect(describeLeaver(maya)).toBe(
      "Maya leaves in 12 days (last day 14 Oct): nothing on the register leaves with Maya.",
    );
  });

  it("sorts soonest first", () => {
    const two = tpl(register.relations, [
      ...people,
      { id: "sam2", name: "Sam Two", role: "Assistant", active: true, lastDay: "2026-10-05" },
    ]);
    expect(leavers(two, [], "2026-10-02").map((l) => l.person.id)).toEqual(["sam2", "maya"]);
  });

  it("sets and clears a last day and marks someone as left without deleting them", () => {
    const withDay = setLastDay(people, "chris", "2026-11-01");
    expect(withDay.find((p) => p.id === "chris")?.lastDay).toBe("2026-11-01");
    const cleared = setLastDay(withDay, "chris", null);
    expect("lastDay" in (cleared.find((p) => p.id === "chris") ?? {})).toBe(false);
    const left = markLeft(people, "maya", "2026-10-15");
    expect(left.find((p) => p.id === "maya")).toMatchObject({
      active: false,
      lastDay: "2026-10-14",
    });
    expect(left).toHaveLength(people.length);
  });

  it("refuses to mark someone as left before their last day has passed", () => {
    expect(canMarkLeft(people[0], "2026-10-01")).toBe(false);
    expect(canMarkLeft(people[0], "2026-10-14")).toBe(false);
    expect(canMarkLeft(people[0], "2026-10-15")).toBe(true);
    expect(canMarkLeft(people[1], "2026-10-15")).toBe(false);
    expect(markLeft(people, "maya", "2026-10-14").find((p) => p.id === "maya")?.active).toBe(true);
    expect(markLeft(people, "chris", "2026-10-15").find((p) => p.id === "chris")?.active).toBe(
      true,
    );
  });

  it("does not let two leavers count each other as cover for shared work", () => {
    const team: Person[] = [
      {
        id: "maya",
        name: "Maya Chen",
        role: "Office manager",
        active: true,
        lastDay: "2026-10-14",
      },
      { id: "chris", name: "Chris Diaz", role: "Assistant", active: true, lastDay: "2026-10-30" },
      { id: "sam", name: "Sam Roy", role: "Hygienist", active: true },
    ];
    const both = tpl(
      [
        { personId: "maya", knowledgeId: "billing", level: "proficient" },
        { personId: "chris", knowledgeId: "billing", level: "proficient" },
        { personId: "sam", knowledgeId: "billing", level: "basic" },
        { personId: "chris", knowledgeId: "pms", level: "expert" },
        { personId: "maya", knowledgeId: "pms", level: "basic" },
      ],
      team,
    );
    const out = leavers(both, [], "2026-10-01");
    expect(out.map((l) => l.person.id)).toEqual(["maya", "chris"]);
    const maya = out[0];
    const chris = out[1];
    // Maya goes first: Chris is still here on her last day, so billing continues for now.
    expect(maya.shared.map((i) => i.id)).toEqual(["billing"]);
    expect(maya.handover.map((h) => h.item.id)).toEqual([]);
    // By Chris's last day Maya is gone too: billing must be handed to Sam, not "shared with Maya".
    expect(chris.shared).toEqual([]);
    expect(chris.handover.map((h) => h.item.id).sort()).toEqual(["billing", "pms"]);
    expect(chris.handover.every((h) => h.successor?.id === "sam")).toBe(true);
    expect(chris.remaining.map((p) => p.id)).toEqual(["sam"]);
    // Only Chris's own work is on Chris's list; Maya's month-end close is not.
    expect(chris.orphanedProcesses).toEqual([]);
    expect(maya.orphanedProcesses).toEqual(["Month-end close"]);
  });

  it("puts shared work on both lists when two people leave the same day", () => {
    const team: Person[] = [
      {
        id: "maya",
        name: "Maya Chen",
        role: "Office manager",
        active: true,
        lastDay: "2026-10-14",
      },
      { id: "chris", name: "Chris Diaz", role: "Assistant", active: true, lastDay: "2026-10-14" },
      { id: "sam", name: "Sam Roy", role: "Hygienist", active: true },
    ];
    const both = tpl(
      [
        { personId: "maya", knowledgeId: "billing", level: "proficient" },
        { personId: "chris", knowledgeId: "billing", level: "proficient" },
      ],
      team,
    );
    const out = leavers(both, [], "2026-10-01");
    expect(out).toHaveLength(2);
    for (const l of out) {
      expect(l.shared).toEqual([]);
      expect(l.handover.map((h) => h.item.id)).toEqual(["billing"]);
      expect(l.handover[0].successor?.id).toBe("sam");
    }
  });
});
