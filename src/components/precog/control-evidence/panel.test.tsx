import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ControlEvidencePanel, ExecutionHistory } from "./panel";
import { ExecutionForm } from "./forms";
import {
  applyCommand,
  emptyLogMessage,
  parseCommand,
} from "@/lib/precog/controls/executions/model";
const state = vi.hoisted(() => ({
  user: null as null | {
    id: string;
    displayName: string;
    primaryEmail: string;
    isDevFallback: boolean;
  },
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
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
  it("explains the bridge from monthly review to the evidence log", () => {
    const html = renderToStaticMarkup(<ControlEvidencePanel />);
    expect(html).toContain("matching preparer entries");
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
    expect(html).toContain("Loading the control evidence log");
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
    expect(html).toContain("Work recorded · recorded by Alex");
    expect(html).toContain("Method: Inspection;");
    expect(html).not.toContain("record · recorded by");
  });
  it("names each follow-up form in words, never the action key", () => {
    const run = applyCommand(
      null,
      parseCommand({
        action: "record",
        commandId: "command2",
        runId: "check2",
        baseRevision: 0,
        controlKey: "bank_statement",
        period: "2026-08",
        performedOn: "2026-09-02",
        performedBy: "Alex",
        method: "reperformance",
        scope: "August reconciliation",
        evidenceRefs: ["Restricted drive: August"],
        result: "no_exception",
        note: "Checked the records.",
      }),
      { id: "a", name: "Alex", canReview: true },
      "2026-09-29T12:00:00Z",
      7,
    );
    expect(renderToStaticMarkup(<ExecutionHistory run={run} />)).toContain(
      "Method: Reperformance / retest;",
    );
    const form = (status: typeof run.status) =>
      renderToStaticMarkup(
        <ExecutionForm
          storageKey="biz1"
          today="2026-09-29"
          period="2026-08"
          accountName="Blair"
          run={{ ...run, status }}
          onSave={async () => true}
        />,
      );
    expect(form("needs_correction")).toContain("Record a correction for this check");
    expect(form("awaiting_review")).toContain("Record a review conclusion for this check");
    expect(form("reviewed")).toContain("Reopen the conclusion for this check");
    expect(form("reviewed")).not.toContain("reopen this check");
  });
  it("names the evidence period the owner chose when the log is empty", () => {
    expect(emptyLogMessage("2026-03")).toBe(
      "Nobody has recorded a control check for March 2026. That does not mean there are no control gaps.",
    );
  });
  it("points a solo owner to the section that invites a reviewer", () => {
    const html = renderToStaticMarkup(<ControlEvidencePanel />);
    expect(html).toContain("invite a reviewer under People at the firm");
    expect(html).not.toContain("Firm members");
    expect(html).toContain("use the control evidence log");
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
    expect(html).toContain("Precog does not upload or check files here");
    expect(html).toContain("Population, period and items checked");
    expect(html).toContain("Record check");
  });
});
