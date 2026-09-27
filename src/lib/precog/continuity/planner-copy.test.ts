import { describe, expect, it } from "vitest";
import { continuityTemplate, knowledgeItem } from "@/test/fixtures";
import { coverageReport } from "./coverage";
import { coverageBadge } from "./planner-copy";

const people = [
  { id: "a", name: "Ana", role: "Owner", active: true },
  { id: "b", name: "Ben", role: "Assistant", active: true },
];

describe("coverageBadge", () => {
  it("reads 'Not marked yet' until someone is marked on the entry at any level", () => {
    const report = coverageReport(
      continuityTemplate({
        people,
        knowledge: [knowledgeItem("unmarked"), knowledgeItem("aware")],
        relations: [{ personId: "b", knowledgeId: "aware", level: "aware" }],
      }),
    );
    const [unmarked, aware] = report.items;
    expect(coverageBadge(unmarked)).toEqual({ label: "Not marked yet", variant: "default" });
    expect(coverageBadge(aware)).toEqual({ label: "Nobody can do this alone", variant: "danger" });
  });
});
