import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dateAfter,
  formatDay,
  formatDayRange,
  formatDayShort,
  formatDayTime,
  localDateKey,
  localDaysBetween,
  serverUtcDay,
  shiftDay,
  utcDateKey,
} from "./dates";

describe("local calendar", () => {
  it("keys a date by the owner's local day", () => {
    expect(localDateKey(new Date(2025, 0, 5, 23, 30))).toBe("2025-01-05");
  });

  it("steps local days across a month end", () => {
    expect(dateAfter(new Date(2025, 0, 30), 3)).toBe("2025-02-02");
    expect(dateAfter(new Date(2025, 2, 1), -1)).toBe("2025-02-28");
  });

  it("counts whole local days whatever the time of day", () => {
    expect(localDaysBetween(new Date(2025, 0, 5, 23, 0), new Date(2025, 0, 6, 1, 0))).toBe(1);
    expect(localDaysBetween(new Date(2025, 0, 6, 9, 0), new Date(2025, 0, 6, 22, 0))).toBe(0);
    expect(localDaysBetween(new Date(2025, 0, 6), new Date(2025, 0, 3))).toBe(-3);
  });
});

describe("UTC calendar", () => {
  it("shifts stored days in UTC", () => {
    expect(shiftDay("2025-12-31", 1)).toBe("2026-01-01");
    expect(shiftDay("2025-03-01", -1)).toBe("2025-02-28");
  });

  it("reads the UTC day of a moment", () => {
    const moment = new Date("2026-10-01T00:30:00Z");
    expect(utcDateKey(moment)).toBe("2026-10-01");
    expect(serverUtcDay(moment)).toBe("2026-10-01");
  });
});

describe("formatters", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("prints days month first in US English", () => {
    expect(formatDay("2026-11-03")).toBe("Nov 3, 2026");
    expect(formatDayShort("2026-11-03")).toBe("Nov 3");
    expect(formatDay(new Date(2026, 10, 3, 15, 0))).toBe("Nov 3, 2026");
    expect(formatDayTime(new Date(2026, 10, 3, 16, 5))).toBe("Nov 3, 2026, 4:05 PM");
  });

  it("prints a stored day as that day, not the day before", () => {
    expect(formatDay("2026-03-01")).toBe("Mar 1, 2026");
  });

  it("falls back to the raw text when the value is not a date", () => {
    expect(formatDay("not a date")).toBe("not a date");
  });

  it("formats ranges within a month, across months and across years", () => {
    expect(formatDayRange("2025-11-03", "2025-11-10")).toBe("Nov 3–10");
    expect(formatDayRange("2025-10-28", "2025-11-03")).toBe("Oct 28 – Nov 3");
    expect(formatDayRange("2025-12-30", "2026-01-02")).toBe("Dec 30, 2025 – Jan 2, 2026");
    expect(formatDayRange("2025-11-03", "2025-11-03")).toBe("Nov 3");
  });
});
