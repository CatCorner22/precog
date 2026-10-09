import { describe, expect, it } from "vitest";
import { defaultProfile } from "../practice-profile";
import { formatDay, formatDayShort, formatMonth } from "../dates";
import { freezeReport, reportScopeFor } from "./stored-model";

describe("stored reporting scope", () => {
  const profile = defaultProfile("dental");

  it("prints calendar day and month labels unchanged across viewer timezones", () => {
    const previous = process.env.TZ;
    try {
      for (const zone of ["America/New_York", "UTC", "Pacific/Kiritimati", "Pacific/Honolulu"]) {
        process.env.TZ = zone;
        expect(formatDay("2026-10-10"), zone).toBe("Oct 10, 2026");
        expect(formatDayShort("2026-10-10"), zone).toBe("Oct 10");
        expect(formatMonth("2026-09"), zone).toBe("September 2026");
      }
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  });

  it("keeps the preparer's day rather than the UTC lock day at the due-day boundary", () => {
    const frozen = freezeReport(profile, "2026-10-10");
    const scope = reportScopeFor(frozen, profile, "2026-10-11T02:00:00Z");
    expect(scope).toMatchObject({ day: "2026-10-10", period: "2026-09" });
    expect(scope).toBe(frozen.model?.reportingScope);
  });

  it("uses the documented UTC fallback for legacy locks without rewriting their model", () => {
    const { reportingScope: _scope, ...model } = freezeReport(profile, "2026-10-10").model!;
    const legacy = { layoutVersion: 7, model };
    const before = JSON.stringify(legacy);
    expect(reportScopeFor(legacy, profile, "2026-10-11T02:00:00Z")).toMatchObject({
      day: "2026-10-11",
      period: "2026-10",
    });
    expect(JSON.stringify(legacy)).toBe(before);
  });

  it("retains the calendar-month rule and undated status for layouts before 5", () => {
    const { reportingScope: _scope, ...model } = freezeReport(profile, "2026-10-06").model!;
    expect(reportScopeFor({ layoutVersion: 4, model }, profile, "2026-10-06T12:00:00Z")).toEqual({
      day: "2026-10-06",
      period: "2026-10",
      acceptedOn: [],
    });
  });

  it("does not invent scope for absent, failed or unsupported stored figures", () => {
    for (const frozen of [
      null,
      { layoutVersion: 8, model: null },
      { layoutVersion: 99, model: freezeReport(profile, "2026-10-06").model },
    ]) {
      expect(reportScopeFor(frozen, profile, "2026-10-06T12:00:00Z")).toBeNull();
    }
  });
});
