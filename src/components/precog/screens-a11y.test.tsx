import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SectionHeader } from "./builder/chips";
import { TabStrip } from "./home-shell-parts";
import { InsuranceRecordPanel } from "./insurance-record-panel";
import { DualReleaseExceptionsCard } from "./dual-release-exceptions-card";
import { EMPTY_EXCEPTION_FORM } from "./dual-release-panel-actions";
import type { DualReleasePanelModel } from "./use-dual-release-panel";
import { DEFAULT_RISK_VARIABLES } from "@/lib/precog/scoring/risk-variables";
import { defaultProfile } from "@/lib/precog/practice-profile";
import { getIndustryCopy } from "@/lib/precog/templates/industry-copy";
import { ReadOnlyPracticeProvider } from "@/lib/precog/read-only-practice";
import { DecisionJournal } from "./decision-journal";

describe("list headers name the list they add to", () => {
  it("labels Add and Cancel with the list's title, starting with the visible word", () => {
    const html = (adding: boolean) =>
      renderToStaticMarkup(
        <SectionHeader icon={null} title="Lean waste" count={2} onAdd={() => {}} adding={adding} />,
      );
    expect(html(false)).toContain('aria-label="Add to lean waste"');
    expect(html(true)).toContain('aria-label="Cancel adding to lean waste"');
  });
});

describe("decision log", () => {
  it("names the decision in each repeated row button", () => {
    const profile = {
      ...defaultProfile(),
      decisions: [
        {
          id: "d1",
          createdAt: "2026-01-02T12:00:00.000Z",
          subject: "Payroll",
          kind: "remediate" as const,
          note: "",
          reviewBy: "2026-01-30",
        },
      ],
    };
    const html = renderToStaticMarkup(
      <ReadOnlyPracticeProvider profile={profile}>
        <DecisionJournal onOpenLinked={() => {}} />
      </ReadOnlyPracticeProvider>,
    );
    expect(html).toContain('aria-label="Still open +90d: Payroll"');
    expect(html).toContain('aria-label="Not relevant: Payroll"');
    expect(html).toContain('aria-label="Delete decision: Payroll"');
  });
});

describe("tab strip", () => {
  it("is the containing block of absolutely placed text inside its tabs", () => {
    const html = renderToStaticMarkup(
      <TabStrip activeId="map" tabCount={1}>
        <button type="button">Map</button>
      </TabStrip>,
    );
    const nav = html.match(/<nav[^>]*class="([^"]*)"/)?.[1] ?? "";
    expect(nav.split(" ")).toContain("relative");
    expect(nav.split(" ")).toContain("overflow-x-auto");
  });
});

describe("insurance record panel", () => {
  it("prints the last confirmation date as a formatted day", () => {
    const html = renderToStaticMarkup(
      <InsuranceRecordPanel
        value={{
          ...DEFAULT_RISK_VARIABLES,
          insurance: {
            status: "reported",
            confirmedFields: ["deductible"],
            modeledScenarioIds: [],
            reviewedOn: "2026-09-30",
          },
        }}
        onChange={() => {}}
      />,
    );
    expect(html).toContain("Last user confirmation: Sep 30, 2026.");
    expect(html).not.toContain("2026-09-30");
  });
});

describe("threshold exception form", () => {
  const model = (from: string, to: string) =>
    ({
      people: [],
      policy: defaultProfile().dualRelease,
      seed: getIndustryCopy("dental").dualReleaseSeed,
      showExForm: true,
      setShowExForm: () => {},
      exForm: { ...EMPTY_EXCEPTION_FORM, label: "Lab", reason: "Monthly invoice", from, to },
      updateExForm: () => {},
      exceptions: [],
      toggleExChannel: () => {},
      addException: () => {},
      toggleException: () => {},
      removeException: () => {},
    }) as unknown as DualReleasePanelModel;

  it("blocks Save and says why when the end date is before the start date", () => {
    const html = renderToStaticMarkup(
      <DualReleaseExceptionsCard model={model("2026-11-01", "2026-10-01")} />,
    );
    expect(html).toContain("The end date is before the start date.");
    expect(html).toContain('min="2026-11-01"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Save exception/);
  });

  it("allows Save for dates in order", () => {
    const html = renderToStaticMarkup(
      <DualReleaseExceptionsCard model={model("2026-10-01", "2026-11-01")} />,
    );
    expect(html).not.toContain("The end date is before the start date.");
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Save exception/);
  });
});
