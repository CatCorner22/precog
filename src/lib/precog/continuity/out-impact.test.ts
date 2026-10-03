import { describe, expect, it } from "vitest";
import { defaultProfile } from "../practice-profile";
import { resolveTemplate } from "../active-template";
import { addStandInOwner, reassignOwner } from "../builder/stand-in-owner";
import { rankDepartureRisk } from "../builder/departure";
import { analyzeAbsenceImpact } from "../sod/coverage-analysis";
import { buildAssignments } from "../sod/detect";
import { personOutDetail } from "./out-impact";

const profile = defaultProfile("dental");
const tpl = resolveTemplate(profile);
const assignments = buildAssignments(tpl);
const jordan = tpl.people.find((p) => p.name === "Jordan Blake")!;

describe("personOutDetail", () => {
  it("lists the processes only this person owns, as the old Bus factor panel did", () => {
    const detail = personOutDetail(tpl, assignments, jordan.id);
    const departure = rankDepartureRisk(tpl, tpl.processes, tpl.people, profile.staff).find(
      (d) => d.person.id === jordan.id,
    )!;
    const ids = detail.processes.map((p) => p.id);
    expect(ids).toContain("proc-cash");
    expect(ids).not.toContain("proc-schedule");
    for (const p of departure.orphanedProcesses) expect(ids).toContain(p.id);
  });

  it("lists the duties that stop, as the old Absence stress test did", () => {
    for (const person of tpl.people.filter((p) => p.active)) {
      const detail = personOutDetail(tpl, assignments, person.id);
      const duty = analyzeAbsenceImpact(assignments, person.id);
      expect(detail.dutiesStop).toEqual(duty?.newlyUnassigned ?? []);
      expect(detail.dutiesOneHolder).toEqual(duty?.newlySinglePoint ?? []);
    }
  });
});

describe("addStandInOwner", () => {
  it("adds a second active owner and keeps the first", () => {
    const change = addStandInOwner(tpl, tpl.processes, "proc-cash", jordan.id)!;
    expect(change).not.toBeNull();
    const owners = change.next.find((p) => p.id === "proc-cash")!.ownerPersonIds ?? [];
    expect(owners).toContain(jordan.id);
    expect(owners).toContain(change.person.id);
    expect(change.person.id).not.toBe(jordan.id);
    expect(change.person.active).toBe(true);
    // The process then has another owner, so it leaves the list.
    const after = personOutDetail({ ...tpl, processes: change.next }, assignments, jordan.id);
    expect(after.processes.map((p) => p.id)).not.toContain("proc-cash");
  });

  it("returns null for a process that is not on the map", () => {
    expect(addStandInOwner(tpl, tpl.processes, "proc-missing", jordan.id)).toBeNull();
  });
});

describe("reassignOwner", () => {
  it("moves the process off this person", () => {
    const change = reassignOwner(tpl, tpl.processes, jordan.id, "proc-cash")!;
    const owners = change.next.find((p) => p.id === "proc-cash")!.ownerPersonIds ?? [];
    expect(owners).not.toContain(jordan.id);
    expect(owners).toContain(change.person.id);
  });
});
