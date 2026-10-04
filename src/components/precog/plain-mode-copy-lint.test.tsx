import type { ReactNode } from "react";
import { prerender } from "react-dom/static";
import { describe, expect, it, vi } from "vitest";
import { resolveTemplate } from "@/lib/precog/active-template";
import { assessCoso } from "@/lib/precog/coso";
import { runPrecogScenario } from "@/lib/precog/engine";
import { INDUSTRIES } from "@/lib/precog/industry";
import { defaultProfile, type PracticeProfile } from "@/lib/precog/practice-profile";
import { PresentationProvider } from "@/lib/precog/presentation";
import { ReadOnlyPracticeProvider } from "@/lib/precog/read-only-practice";
import { AdvancedReasoningPanel } from "./advanced-reasoning-panel";
import { CascadePanel } from "./cascade-panel";
import { ContinuityPlanner } from "./continuity-planner";
import { KnowledgeMap } from "./knowledge-map";
import { MetaAnalysisPanel } from "./meta-analysis-panel";
import { MonthlyArea } from "./monthly-area";
import { PioneerCoach } from "./pioneer-coach";
import { ProceduresPanel } from "./procedures/procedures-panel";
import { ProcessMap } from "./process-map";
import { ScenarioCompare } from "./scenario-compare";
import { ScenarioRunner } from "./scenario-runner";
import { ScenarioVariablesView } from "./scenario-variables-view";
import { ScoresArea } from "./scores-area";
import { SignalsPanel } from "./signals-panel";
import { SodPanel } from "./sod-panel";
import type { StaffWhatIf } from "./staff-what-if";
import { StartHere } from "./start-here";
import { TeamArea } from "./team-area";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  useNavigate: () => () => {},
}));

/**
 * Words plain mode never shows: method and framework names an owner would
 * have to look up. Tactical mode keeps them on purpose. Each is matched as a
 * whole word and case-sensitively, so "SoD" does not match inside another
 * word and "segregated" in a quoted court record is not a hit.
 */
const TACTICAL_ONLY = [
  "Bus factor",
  "Lean waste",
  "Residual risk register",
  "Selected risk anatomy",
  "Forensic screen",
  "Johari",
  "COSO",
  "SoD",
  "Segregation",
].map((word) => ({ word, pattern: new RegExp(`\\b${word}\\b`) }));

/** Every tactical-only word the text carries, each with a little context. */
function hits(text: string): string[] {
  return TACTICAL_ONLY.flatMap(({ word, pattern }) => {
    const at = text.search(pattern);
    return at < 0 ? [] : [`${word}: …${text.slice(Math.max(0, at - 60), at + 60)}…`];
  });
}

/**
 * A screen's rendered text in plain mode (the provider's first render is
 * plain), once every lazy part has loaded. Attributes count too, since a
 * screen reader reads an aria-label aloud.
 */
async function plainText(profile: PracticeProfile, node: ReactNode): Promise<string> {
  const { prelude } = await prerender(
    <PresentationProvider>
      <ReadOnlyPracticeProvider profile={profile}>{node}</ReadOnlyPracticeProvider>
    </PresentationProvider>,
  );
  const html = await new Response(prelude).text();
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/\s(?:aria-label|title|alt|placeholder)="([^"]*)"/g, " >$1< ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

const noop = () => {};

function scenarioProps(profile: PracticeProfile) {
  const tpl = resolveTemplate(profile);
  const scenario = tpl.scenarios[0];
  const staffWhatIf: StaffWhatIf = {
    staff: profile.staff,
    saved: profile.staff,
    ownBusiness: false,
    onChange: noop,
    onApply: noop,
    onReset: noop,
  };
  const result = runPrecogScenario(tpl, scenario.id, {
    mitigationIds: [],
    staff: profile.staff,
    riskVariables: profile.riskVariables,
  });
  return { tpl, scenario, staffWhatIf, result };
}

/** The primary areas, each as the home shell mounts it (or its parts, where the shell adds only a heading). */
const PRIMARY: [string, (profile: PracticeProfile) => ReactNode][] = [
  ["Start here", () => <StartHere onOpenDetail={noop} />],
  ["Team", () => <TeamArea />],
  ...["conflicts", "dual", "matrix", "roles", "power", "controls"].map(
    (view): [string, () => ReactNode] => [
      `Who controls what, ${view}`,
      () => <SodPanel initialView={view} onNavigate={noop} />,
    ],
  ),
  ["Who knows what", () => <ContinuityPlanner />],
  ["Procedures", () => <ProceduresPanel />],
  ["Monthly review", () => <MonthlyArea item={null} openTab={noop} />],
];

/**
 * The Advanced areas. Views a screen opens with a button (the scenario and
 * pattern views) are rendered as the screen mounts them, since a static
 * render cannot press the button.
 */
const ADVANCED: [string, (profile: PracticeProfile) => ReactNode][] = [
  ["Who knows what, as a drawing", () => <KnowledgeMap />],
  ["How work flows", () => <ProcessMap onNavigate={noop} />],
  ["How work flows, build mode", () => <ProcessMap onNavigate={noop} initialBuild />],
  ["Scenarios", () => <ScenarioRunner />],
  [
    "Scenarios, compare",
    (profile) => {
      const p = scenarioProps(profile);
      return (
        <ScenarioCompare
          initialScenarioId={p.scenario.id}
          staffWhatIf={p.staffWhatIf}
          riskVariables={profile.riskVariables}
        />
      );
    },
  ],
  [
    "Scenarios, settings and insurance",
    (profile) => {
      const p = scenarioProps(profile);
      return (
        <ScenarioVariablesView
          scenarios={p.tpl.scenarios}
          scenario={p.scenario}
          onPick={noop}
          riskVariables={profile.riskVariables}
          onRiskVariablesChange={noop}
          result={p.result}
          ownBusiness={false}
          whatIfActive={false}
          onShowCascades={noop}
        />
      );
    },
  ],
  ["Scenarios, what else moves", () => <CascadePanel />],
  ["Ask Pioneer", () => <PioneerCoach onNavigate={noop} />],
  ...["residual", "coverage", "patterns"].map((view): [string, () => ReactNode] => [
    `How Precog scores, ${view}`,
    () => <ScoresArea view={view} openTab={noop} onNavigate={noop} />,
  ]),
  ["Patterns, signals", () => <SignalsPanel onNavigate={noop} />],
  ["Patterns, reasoning", () => <AdvancedReasoningPanel />],
  ["Patterns, what Precog can see", () => <MetaAnalysisPanel onNavigate={noop} />],
];

const CASES = INDUSTRIES.flatMap(({ id }) =>
  [...PRIMARY, ...ADVANCED].map(([area, node]) => ({ industry: id, area, node })),
);

describe("plain mode keeps tactical terms off every area", () => {
  it.each(CASES)("$industry sample, $area", async ({ industry, area, node }) => {
    const profile = defaultProfile(industry);
    const text = await plainText(profile, node(profile));
    expect(text.length, area).toBeGreaterThan(200);
    expect(hits(text)).toEqual([]);
  });

  // The coverage check opens on one part; the owner can open any of the five,
  // so every part's notes and gaps are checked in their plain wording.
  it.each(INDUSTRIES.map((i) => i.id))("%s sample, every coverage-check part", (industry) => {
    const profile = defaultProfile(industry);
    const { components, priorityFindings } = assessCoso(resolveTemplate(profile), profile.staff, {
      riskVariables: profile.riskVariables,
      dualRelease: profile.dualRelease,
      accessReconciliation: profile.accessReconciliation,
    });
    const text = [
      ...components.flatMap((c) => [
        c.name,
        c.description,
        ...c.principles.map((p) => p.plainNote ?? p.note),
        ...c.findings.flatMap((f) => [f.label, f.plainDetail ?? f.detail]),
        ...c.primaryActions.map((a) => a.label),
      ]),
      ...priorityFindings.map((f) => f.plainDetail ?? f.detail),
    ].join(" ");
    expect(hits(text)).toEqual([]);
  });
});
