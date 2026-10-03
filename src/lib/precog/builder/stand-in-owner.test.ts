import { describe, expect, it } from "vitest";
import { defaultProfile } from "../practice-profile";
import { resolveTemplate } from "../active-template";
import { addStandInOwner, reassignOwner, undoOwnerChange } from "./stand-in-owner";

const tpl = resolveTemplate(defaultProfile("dental"));
const ownerOf = (id: string, processes = tpl.processes) =>
  processes.find((p) => p.id === id)?.ownerPersonIds;

describe("undoOwnerChange", () => {
  it("gives a stand-in owner's process back the owners it had", () => {
    // Jordan Blake is the only owner of cash handling in the dental sample.
    const jordan = tpl.people.find((p) => p.name === "Jordan Blake")!;
    const change = addStandInOwner(tpl, tpl.processes, "proc-cash", jordan.id)!;
    expect(change).not.toBeNull();
    expect(ownerOf("proc-cash", change.next)).toContain(change.person.id);
    expect(undoOwnerChange(change.next, change)).toEqual(tpl.processes);
  });

  it("undoes a reassignment and keeps edits to other processes", () => {
    const proc = tpl.processes.find((p) => (p.ownerPersonIds ?? []).length > 0)!;
    const from = proc.ownerPersonIds![0];
    const change = reassignOwner(tpl, tpl.processes, from, proc.id)!;
    expect(change).not.toBeNull();
    const other = tpl.processes.find((p) => p.id !== proc.id)!;
    const edited = change.next.map((p) => (p.id === other.id ? { ...p, name: "Renamed" } : p));
    const undone = undoOwnerChange(edited, change);
    expect(ownerOf(proc.id, undone)).toEqual(proc.ownerPersonIds);
    expect(undone.find((p) => p.id === other.id)?.name).toBe("Renamed");
  });
});
