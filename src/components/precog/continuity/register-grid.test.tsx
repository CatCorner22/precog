import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RegisterGrid } from "@/components/precog/continuity/register-grid";
import type { RegisterEditor } from "@/components/precog/continuity/use-continuity-planner";
import { coverageReport } from "@/lib/precog/continuity/coverage";
import { continuityTemplate, knowledgeItem } from "@/test/fixtures";

vi.mock("@/lib/precog/presentation", () => ({
  useTabName: () => (tab: string) => tab,
}));

describe("RegisterGrid coverage badges", () => {
  it("shows former-only relations as uncovered and untouched items as not marked yet", () => {
    const tpl = continuityTemplate({
      people: [
        { id: "active", name: "Ana Ruiz", role: "Owner", active: true },
        { id: "former", name: "Avery", role: "Former", active: false },
      ],
      knowledge: [knowledgeItem("Insurance denial appeals"), knowledgeItem("Untouched item")],
      relations: [
        {
          personId: "former",
          knowledgeId: "Insurance denial appeals",
          level: "proficient",
        },
      ],
    });
    const report = coverageReport(tpl);
    const activePeople = tpl.people.filter((person) => person.active);
    const register = {
      importIssues: [],
      people: activePeople,
      visiblePeople: activePeople,
      visibleItems: report.items,
      itemPage: 0,
      itemPages: 1,
      peoplePage: 0,
      peoplePages: 1,
      selected: report.items[0],
      draftName: "",
      draftKind: "duty",
      draftCriticality: "important",
      staleIds: new Set<string>(),
      dismissImportIssues: vi.fn(),
      addItem: vi.fn(),
      setDraftName: vi.fn(),
      setDraftKind: vi.fn(),
      setDraftCriticality: vi.fn(),
      setItemPage: vi.fn(),
      setPeoplePage: vi.fn(),
      select: vi.fn(),
      setLevel: vi.fn(),
      removeItem: vi.fn(),
    } as unknown as RegisterEditor;
    const html = renderToStaticMarkup(
      <RegisterGrid register={register} report={report} tpl={tpl} trackFreshness={false} />,
    );

    expect(html.match(/Nobody can do this alone/g)).toHaveLength(1);
    expect(html.match(/Not marked yet/g)).toHaveLength(1);
  });
});
