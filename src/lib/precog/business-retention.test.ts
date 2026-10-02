import { describe, expect, it } from "vitest";
import {
  HISTORY_RETENTION_DAYS,
  HISTORY_VERSION_WINDOW_MINUTES,
  historyRuleText,
  MAX_HISTORY_PER_BUSINESS,
} from "./business-retention";

describe("change history rule", () => {
  it("keeps one version per 15 minutes of each person's editing, for 90 days (owner decision 20)", () => {
    expect([HISTORY_VERSION_WINDOW_MINUTES, HISTORY_RETENTION_DAYS]).toEqual([15, 90]);
  });

  it("states the rule the store applies, from the same constants", () => {
    expect(historyRuleText("Acme Dental")).toBe(
      `Precog keeps one version of Acme Dental for every ${HISTORY_VERSION_WINDOW_MINUTES} minutes of editing by each person, for ${HISTORY_RETENTION_DAYS} days and at most ${MAX_HISTORY_PER_BUSINESS} versions, with who made each one.`,
    );
    expect(historyRuleText("Acme Dental")).toBe(
      "Precog keeps one version of Acme Dental for every 15 minutes of editing by each person, for 90 days and at most 200 versions, with who made each one.",
    );
  });
});
