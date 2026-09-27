import { describe, expect, it } from "vitest";
import { getIndustryTemplate } from "../templates";
import { INDUSTRIES } from "../industry";
import type { EvidenceFrequency, EvidenceItem, ProcessNode } from "../types";
import { evidenceStatus, FREQUENCY_DAYS, suggestEvidence } from "./evidence";

const at = (iso: string) => new Date(iso).getTime();

function item(frequency: EvidenceFrequency, lastDoneAt?: string): EvidenceItem {
  return { id: "e1", label: "Check", frequency, lastDoneAt };
}

describe("evidenceStatus", () => {
  it("is current the moment an item of any frequency is marked done", () => {
    const now = "2026-09-10T15:00:00";
    for (const frequency of Object.keys(FREQUENCY_DAYS) as EvidenceFrequency[]) {
      expect(evidenceStatus(item(frequency, now), at(now))).toEqual({
        status: "current",
        daysLeft: FREQUENCY_DAYS[frequency],
      });
    }
  });

  it("puts a daily item due soon on its due day and overdue the day after", () => {
    const done = item("daily", "2026-09-10T15:00:00");
    expect(evidenceStatus(done, at("2026-09-11T08:00:00"))).toEqual({
      status: "due_soon",
      daysLeft: 0,
    });
    expect(evidenceStatus(done, at("2026-09-12T08:00:00")).status).toBe("overdue");
  });

  it("puts a weekly item due soon one day before it is due", () => {
    const done = item("weekly", "2026-09-10T15:00:00");
    expect(evidenceStatus(done, at("2026-09-15T08:00:00")).status).toBe("current");
    expect(evidenceStatus(done, at("2026-09-16T08:00:00"))).toEqual({
      status: "due_soon",
      daysLeft: 1,
    });
  });

  it("counts calendar days, not rounded hours", () => {
    // Done late on Sep 1, checked early on Oct 1: the review falls due that day.
    const done = item("monthly", "2026-09-01T23:30:00");
    expect(evidenceStatus(done, at("2026-10-01T08:00:00")).daysLeft).toBe(0);
  });

  it("says never for an item nobody has done", () => {
    expect(evidenceStatus(item("weekly"))).toEqual({ status: "never", daysLeft: null });
  });
});

describe("suggestEvidence", () => {
  const labels = (name: string, description = "") =>
    suggestEvidence({
      id: "p",
      name,
      description,
      layer: "process",
      dependencies: [],
      controlIds: [],
    } as ProcessNode).map((e) => e.label);

  it("does not read 'count' inside 'account' or 'ap' inside 'map'", () => {
    expect(labels("Accounts payable")).not.toContain("Cycle count variance investigated");
    expect(labels("Site map review")).not.toContain(
      "New-vendor and payment-batch approval log reviewed",
    );
  });

  it("still matches whole words", () => {
    expect(labels("Inventory counts")).toContain("Cycle count variance investigated");
    expect(labels("AP batch")).toContain("New-vendor and payment-batch approval log reviewed");
    expect(labels("Claims & denials")).toContain("Adjustment / write-off report reviewed by owner");
  });

  it("proposes a cycle count only for sample processes about stock", () => {
    for (const { id } of INDUSTRIES) {
      for (const process of getIndustryTemplate(id).processes) {
        const text = `${process.name} ${process.description}`.toLowerCase();
        if (suggestEvidence(process).some((e) => e.label.startsWith("Cycle count")))
          expect(text, `${id}: ${process.name}`).toMatch(/\b(inventory|stock|counts?)\b/);
      }
    }
  });
});
