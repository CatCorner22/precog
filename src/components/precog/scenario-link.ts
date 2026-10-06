export type ScenarioView = "single" | "compare" | "variables" | "cascades" | "failure";

interface ParsedScenarioItem {
  view: ScenarioView;
  scenarioId: string | null;
  failureTarget: string | null;
}

export function parseScenarioItem(item: string | null | undefined): ParsedScenarioItem {
  if (!item) return { view: "single", scenarioId: null, failureTarget: null };

  if (item === "compare" || item === "variables" || item === "cascades") {
    return { view: item, scenarioId: null, failureTarget: null };
  }
  if (item === "failure") return { view: "failure", scenarioId: null, failureTarget: null };

  const failureTarget = /^failure:([^:]+):(.+)$/.exec(item);
  if (failureTarget) {
    return { view: "failure", scenarioId: null, failureTarget: failureTarget.slice(1).join(":") };
  }

  return { view: "single", scenarioId: item, failureTarget: null };
}

export function scenarioItem(
  view: ScenarioView,
  scenarioId: string | null,
  failureTarget?: string | null,
): string | undefined {
  if (view === "single") return scenarioId ?? undefined;
  if (view === "failure" && failureTarget) return `failure:${failureTarget}`;
  return view;
}
