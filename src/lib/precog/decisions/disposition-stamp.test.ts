import { describe, expect, it } from "vitest";
import { defaultProfile, type DecisionEntry } from "../practice-profile";
import { stampDispositions } from "./disposition-stamp";

const SAVER = { id: "saver_1", name: "Ada Park" };

function entry(id: string, by: { userId: string; name: string }): DecisionEntry {
  return {
    id,
    createdAt: "2026-09-26T10:00:00.000Z",
    subject: "Cash and reconciliation",
    kind: "monitor",
    note: "",
    disposition: { verdict: "not_valid", reason: "other", at: "2026-09-26", by, note: "" },
  };
}

describe("stampDispositions", () => {
  it("stamps a new judgement with the saver, however the browser named it", () => {
    const next = {
      ...defaultProfile("dental"),
      decisions: [entry("d1", { userId: "mallory", name: "Mal" })],
    };
    const stamped = stampDispositions(next, null, SAVER);
    expect(stamped.decisions[0].disposition?.by).toEqual({ userId: "saver_1", name: "Ada Park" });
  });

  it("re-stamps a changed judgement and keeps a stored one as it is", () => {
    const previous = {
      ...defaultProfile("dental"),
      decisions: [
        entry("kept", { userId: "reviewer_9", name: "Rae" }),
        entry("changed", { userId: "reviewer_9", name: "Rae" }),
      ],
    };
    const changed = entry("changed", { userId: "reviewer_9", name: "Rae" });
    const rechecked: DecisionEntry = {
      ...changed,
      disposition: { ...changed.disposition!, note: "rechecked" },
    };
    const next = {
      ...defaultProfile("dental"),
      decisions: [entry("kept", { userId: "reviewer_9", name: "Rae" }), rechecked],
    };
    const stamped = stampDispositions(next, previous, SAVER);
    expect(stamped.decisions[0].disposition?.by).toEqual({ userId: "reviewer_9", name: "Rae" });
    expect(stamped.decisions[1].disposition?.by).toEqual({ userId: "saver_1", name: "Ada Park" });
  });

  it("leaves entries without a judgement and identical profiles alone", () => {
    const plain = { ...defaultProfile("dental"), decisions: [] };
    expect(stampDispositions(plain, null, SAVER)).toBe(plain);
    const judged = {
      ...defaultProfile("dental"),
      decisions: [entry("d1", { userId: "reviewer_9", name: "Rae" })],
    };
    expect(stampDispositions(judged, judged, SAVER)).toBe(judged);
  });
});
