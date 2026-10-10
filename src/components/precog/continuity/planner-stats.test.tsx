import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlannerStats } from "@/components/precog/continuity/planner-stats";
import { coverageReport, criticalSinglePoints } from "@/lib/precog/continuity/coverage";
import { documentationDebt } from "@/lib/precog/continuity/documentation";
import { continuityTemplate, knowledgeItem } from "@/test/fixtures";

describe("PlannerStats single-point hint", () => {
  it("distinguishes unmarked critical items from recorded items nobody can run", () => {
    const tpl = continuityTemplate({
      people: [{ id: "a", name: "Ana", role: "Owner", active: true }],
      knowledge: [
        knowledgeItem("unmarked-one"),
        knowledgeItem("unmarked-two"),
        knowledgeItem("recorded-nobody"),
        knowledgeItem("one-person"),
      ],
      relations: [
        { personId: "a", knowledgeId: "recorded-nobody", level: "aware" },
        { personId: "a", knowledgeId: "one-person", level: "expert" },
      ],
    });
    const html = renderToStaticMarkup(
      <PlannerStats
        registerAssessed
        report={coverageReport(tpl)}
        docs={documentationDebt(tpl)}
        tpl={tpl}
        figures={{
          singlePoints: criticalSinglePoints(tpl),
          importantSinglePoints: 0,
          mostDepended: undefined,
        }}
      />,
    );

    expect(html).toContain(
      "Items the business stops without: 1 with nobody and 1 with one person who can run them alone and 2 not marked yet.",
    );
  });

  it("wraps a long name in the Most depended on stat", () => {
    const name = "Benjamin Christopher-Worthington";
    const tpl = continuityTemplate({
      people: [{ id: "ben", name, role: "Owner", active: true }],
      knowledge: [knowledgeItem("critical")],
      relations: [{ personId: "ben", knowledgeId: "critical", level: "expert" }],
    });
    const report = coverageReport(tpl);
    const html = renderToStaticMarkup(
      <PlannerStats
        registerAssessed
        report={report}
        docs={documentationDebt(tpl)}
        tpl={tpl}
        figures={{
          singlePoints: criticalSinglePoints(tpl),
          importantSinglePoints: 0,
          mostDepended: report.people[0],
        }}
      />,
    );

    expect(html).toContain(name);
    expect(html).toContain("min-w-0 rounded-xl");
    expect(html).toContain("[overflow-wrap:anywhere]");
    expect(html).not.toContain("truncate");
  });
});
