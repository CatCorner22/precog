import { describe, expect, it } from "vitest";
import { constructionTemplate } from "./construction";

describe("construction sample", () => {
  it("describes the write-off scenario in terms its own roster allows", () => {
    const approvers = Object.entries(constructionTemplate.roleTemplates ?? {})
      .filter(([, duties]) => duties.includes("approve_writeoffs"))
      .map(([role]) => role);
    expect(approvers).toEqual(["Owner / President"]);

    const writeOff = constructionTemplate.scenarios.find((s) => s.id === "sc-writeoff-abuse");
    const risk = constructionTemplate.processes
      .flatMap((p) => p.risks ?? [])
      .find((r) => r.linkedScenarioId === "sc-writeoff-abuse");
    for (const title of [writeOff?.title, risk?.title]) {
      expect(title).toBeTruthy();
      expect(title).not.toMatch(/without owner approval/i);
    }
  });
});
