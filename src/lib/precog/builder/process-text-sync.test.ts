import { describe, expect, it } from "vitest";
import { commitFormText, initialFormText, syncFormText } from "./process-text-sync";
import type { ProcessNode } from "../types";

const original: ProcessNode = {
  id: "p1",
  name: "Scheduling & chair utilization",
  description: "Books patients",
  inputs: ["Referral", "Recall list"],
  outputs: ["Schedule"],
  systems: ["Dentrix"],
  layer: "process",
  dependencies: [],
  controlIds: [],
};

/** The form types a new name and the debounce commits it; the parent applies the patch. */
function typeAndCommit(process: ProcessNode, name: string) {
  const text = initialFormText(process);
  const fields = { ...text.fields, name };
  const { patch, seenKey } = commitFormText(fields, process);
  return { text: { fields, seenKey }, process: { ...process, ...patch } };
}

describe("process form text sync", () => {
  it("keeps the owner's own committed edit (no reset on the echo)", () => {
    const { text, process } = typeAndCommit(original, "Scheduling ZZ");
    expect(process.name).toBe("Scheduling ZZ");
    expect(syncFormText(text, process)).toBe(text);
  });

  it("takes the undone text after Ctrl+Z, so the stale name is not written back", () => {
    const { text } = typeAndCommit(original, "Scheduling ZZ");
    // Undo puts the original process back while the form stays mounted.
    const synced = syncFormText(text, original);
    expect(synced.fields.name).toBe("Scheduling & chair utilization");
    // The unmount / debounce commit then has nothing to write.
    expect(commitFormText(synced.fields, original).patch).toEqual({});
  });

  it("still commits an edit typed after an outside change", () => {
    const imported = { ...original, description: "Books and confirms patients" };
    const synced = syncFormText(initialFormText(original), imported);
    expect(synced.fields.desc).toBe("Books and confirms patients");
    const { patch } = commitFormText({ ...synced.fields, name: "Scheduling" }, imported);
    expect(patch).toEqual({ name: "Scheduling" });
  });

  it("does not reset the fields for a change outside the text (owners, controls)", () => {
    const text = { ...initialFormText(original) };
    text.fields = { ...text.fields, inputs: "Referral, Recall list," };
    const withOwner = { ...original, ownerPersonIds: ["p-ana"] };
    expect(syncFormText(text, withOwner)).toBe(text);
  });
});
