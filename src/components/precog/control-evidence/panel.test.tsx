import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ControlEvidencePanel, ExecutionHistory } from "./panel";
import { ExecutionForm } from "./forms";
import { applyCommand, parseCommand } from "@/lib/precog/controls/executions/model";
const state = vi.hoisted(() => ({
  user: null as null | {
    id: string;
    displayName: string;
    primaryEmail: string;
    isDevFallback: boolean;
  },
}));
vi.mock("@/lib/auth/use-current-user", () => ({ useCurrentUser: () => state.user }));
vi.mock("@/lib/precog/practice-context", () => ({
  usePractice: () => ({ profile: { businessId: "biz_1" }, ready: true, switchingBusiness: false }),
}));
vi.mock("@/lib/use-today", () => ({ useToday: () => new Date("2026-09-29T12:00:00Z") }));
vi.mock("@/lib/precog/controls/executions/server", () => ({
  getControlExecutionLog: vi.fn(),
  recordControlExecution: vi.fn(),
}));
beforeEach(() => {
  state.user = null;
});
describe("control log presentation", () => {
  it("does not imply legacy Done results are reviewed evidence", () => {
    const html = renderToStaticMarkup(<ControlEvidencePanel />);
    expect(html).toContain("not converted into evidence");
    expect(html).toContain("not an audit opinion");
  });
  it("gates account logging while signed out or using the shared dev identity", () => {
    expect(renderToStaticMarkup(<ControlEvidencePanel />)).toContain("Sign in");
    state.user = {
      id: "dev-user",
      displayName: "Dev",
      primaryEmail: "dev@example.test",
      isDevFallback: true,
    };
    expect(renderToStaticMarkup(<ControlEvidencePanel />)).toContain("Sign in");
  });
  it("distinguishes loading from an empty log", () => {
    state.user = {
      id: "real",
      displayName: "Reviewer",
      primaryEmail: "reviewer@example.test",
      isDevFallback: false,
    };
    const html = renderToStaticMarkup(<ControlEvidencePanel />);
    expect(html).toContain("Loading account log");
    expect(html).not.toContain("No evidence-backed checks");
  });
  it("renders reference text without executing markup or linking unknown destinations", () => {
    const run = applyCommand(
      null,
      parseCommand({
        action: "record",
        commandId: "command1",
        runId: "check1",
        baseRevision: 0,
        controlKey: "bank_statement",
        period: "2026-08",
        performedOn: "2026-09-02",
        performedBy: "Alex",
        method: "inspection",
        scope: "August reconciliation",
        evidenceRefs: ['<img src=x onerror="alert(1)">', "javascript:alert(1)"],
        result: "no_exception",
        note: "Checked the records.",
      }),
      { id: "a", name: "Alex", canReview: true },
      "2026-09-29T12:00:00Z",
      7,
    );
    const html = renderToStaticMarkup(<ExecutionHistory run={run} />);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("href=");
    expect(html).toContain("&lt;img");
    expect(html).toContain("Reported performed by Alex");
  });
  it("labels evidence as references rather than uploaded files", () => {
    const html = renderToStaticMarkup(
      <ExecutionForm
        storageKey="biz1"
        today="2026-09-29"
        period="2026-08"
        accountName="Alex"
        onSave={async () => true}
      />,
    );
    expect(html).toContain("No files are uploaded or checked here");
    expect(html).toContain("Population, period and items checked");
    expect(html).toContain("Record check");
  });
});
