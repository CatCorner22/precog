import { isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Person } from "@/lib/precog/types";
import { monthlyReviewTasks, REVIEW_ITEMS, type ReviewRecord } from "@/lib/precog/firm/reviews";
import type { ControlExecution } from "@/lib/precog/controls/executions/model";
import { createHookRuntime, type HookRuntime } from "@/test/hook-runtime";
import { MonthlyReview } from "./monthly-review";
import {
  EVIDENCE_PAGE_LIMIT,
  EVIDENCE_STATUS_LABEL,
  evidenceLogLine,
  evidenceStatuses,
  readMonthlyEvidence,
  type EvidencePage,
} from "./monthly-review-evidence";

const state = vi.hoisted(() => ({
  people: [] as Person[],
  records: [] as ReviewRecord[],
  user: null as { id: string; isDevFallback?: boolean } | null,
  businessId: undefined as string | undefined,
  today: new Date(2026, 8, 29),
}));
// Under `hooks.runtime` (src/test/hook-runtime.ts) state persists and effects
// run as React runs them, so a test can press the screen's buttons without a
// DOM renderer and sees how often the screen calls the server.
const hooks = vi.hoisted(() => ({ runtime: null as HookRuntime | null }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (init: unknown) =>
      hooks.runtime?.active ? hooks.runtime.useState(init) : actual.useState(init),
    useEffect: (effect: () => void, deps?: unknown[]) =>
      hooks.runtime?.active
        ? hooks.runtime.useEffect(effect, deps)
        : actual.useEffect(effect, deps),
  };
});
const toast = vi.hoisted(() => ({ success: vi.fn(), warning: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
const server = vi.hoisted(() => ({ recordMonthlyReview: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
const practice = vi.hoisted(() => ({ setMonthlyReviews: vi.fn() }));
vi.mock("@/lib/precog/practice-context", () => ({
  usePractice: () => ({
    profile: { monthlyReviews: state.records, businessId: state.businessId },
    template: { people: state.people, roleTemplates: {} },
    setMonthlyReviews: practice.setMonthlyReviews,
  }),
}));
// A new object on every call, as the real session hook builds one on every render.
vi.mock("@/lib/auth/use-current-user", () => ({
  useCurrentUser: () => (state.user ? { isDevFallback: false, ...state.user } : null),
}));
vi.mock("@/lib/use-today", () => ({ useToday: () => state.today }));
vi.mock("@/lib/precog/firm/server", () => server);
const evidenceLog = vi.hoisted(() => ({ getControlExecutionLog: vi.fn() }));
vi.mock("@/lib/precog/controls/executions/server", () => evidenceLog);
const qbo = vi.hoisted(() => ({
  getQuickBooksStatus: vi.fn(async () => ({ configured: false, connection: null, drift: null })),
}));
vi.mock("@/lib/precog/integrations/qbo/server", () => qbo);
const runtime = createHookRuntime();
hooks.runtime = runtime;

const owner = (): Person => ({
  id: "owner",
  name: "Owner",
  role: "Owner",
  active: true,
  owner: true,
  entitlements: ["enter_payroll", "sign_checks", "bank_reconcile", "create_vendor"],
});
const view = () => renderToStaticMarkup(<MonthlyReview />);

const BANK = "Open the bank statement";
/**
 * Presses the first check's result button, as a signed-in owner of a saved
 * business, after choosing the owner as the person who did the check and
 * typing `note` when given (an Exception needs one).
 */
async function press(label: string, note = "") {
  state.user = { id: "owner" };
  state.businessId = "biz_1";
  if (state.people.length === 0) state.people = [owner()];
  await runtime.settle(() => MonthlyReview());
  const render = () => runtime.render(() => MonthlyReview());
  whoField(render(), BANK).props.onChange({ target: { value: "Owner" } });
  if (note) noteField(render(), BANK).props.onChange({ target: { value: note } });
  const button = buttons(render()).find((b) => b.props.children === label);
  if (!button) throw new Error(`No ${label} button`);
  button.props.onClick();
  await vi.waitFor(() =>
    expect(Object.values(toast).some((fn) => fn.mock.calls.length > 0)).toBe(true),
  );
}
type Button = {
  props: { children: unknown; onClick: () => void; disabled?: boolean; "aria-pressed"?: boolean };
};
function buttons(node: ReactNode): Button[] {
  return elements(node, "button") as unknown as Button[];
}
type Select = {
  props: { value: string; onChange: (event: { target: { value: string } }) => void };
};
/** The "Who did this check" picker of the check titled `title`. */
function whoField(node: ReactNode, title: string): Select {
  const found = (
    elements(node, "select") as unknown as (Select & {
      props: { "aria-label": string };
    })[]
  ).find((select) => select.props["aria-label"] === `Who did ${title}`);
  if (!found) throw new Error(`No who field for ${title}`);
  return found;
}
/** The name field shown once "Someone else" is chosen for the check titled `title`. */
function otherNameField(node: ReactNode, title: string): Input {
  const found = (elements(node, "input") as unknown as Input[]).find(
    (input) => input.props["aria-label"] === `Name of who did ${title}`,
  );
  if (!found) throw new Error(`No name field for ${title}`);
  return found;
}
type Input = {
  props: {
    "aria-label": string;
    value: string;
    onChange: (event: { target: { value: string } }) => void;
  };
};
/** The note field of the check titled `title`. */
function noteField(node: ReactNode, title: string): Input {
  const found = (elements(node, "input") as unknown as Input[]).find(
    (input) => input.props["aria-label"] === `Note for ${title}`,
  );
  if (!found) throw new Error(`No note field for ${title}`);
  return found;
}
function elements(node: ReactNode, type: string): ReactNode[] {
  if (Array.isArray(node)) return node.flatMap((child) => elements(child, type));
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  const own = node.type === type ? [node] : [];
  return [...own, ...elements(node.props.children, type)];
}

beforeEach(() => {
  state.people = [];
  state.records = [];
  state.user = null;
  state.businessId = undefined;
  state.today = new Date(2026, 8, 29);
  server.recordMonthlyReview.mockReset();
  practice.setMonthlyReviews.mockReset();
  evidenceLog.getControlExecutionLog.mockReset();
  qbo.getQuickBooksStatus.mockClear();
  runtime.reset();
  for (const fn of Object.values(toast)) fn.mockReset();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 29, 9));
});
afterEach(() => {
  runtime.reset();
  vi.useRealTimers();
});

describe("monthly review communicates evidence limits", () => {
  it("shows self-review rather than granting independence to the sole owner", () => {
    state.people = [owner()];
    const html = view();
    expect(html.match(/data-review-independence="self_review"/g)).toHaveLength(4);
    expect(html).toContain("ownership alone does not make the review independent");
  });
  it("qualifies even a separate recorded reviewer with an actual-permissions check", () => {
    state.people = [
      owner(),
      {
        ...owner(),
        id: "reviewer",
        name: "Reviewer",
        owner: false,
        role: "Reviewer",
        entitlements: ["view_reports_only"],
      },
    ];
    const html = view();
    expect(html.match(/data-review-independence="separate_duties"/g)).toHaveLength(4);
    expect(html).toContain("Confirm actual permissions and ability");
  });
  it("does not turn title suggestions into confirmed independence", () => {
    state.people = [{ ...owner(), entitlements: ["view_reports_only"], dutiesFromTitle: true }];
    expect(view().match(/data-review-independence="not_established"/g)).toHaveLength(4);
  });
  it("does not invent a qualified reviewer for an empty team", () => {
    const html = view();
    expect(html).toContain("Reviewer not assigned");
    expect(html.match(/data-review-independence="not_established"/g)).toHaveLength(4);
  });
  it("keeps a reported Done result distinct from independent verification", () => {
    state.people = [owner()];
    state.records = [
      {
        key: "payroll_headcount",
        period: "2026-09",
        result: "done",
        ownerName: "Owner",
        notes: "Reviewed",
        recordedAt: "2026-09-29T12:00:00Z",
      },
    ];
    const html = view();
    expect(html).toContain("Saved: Done by Owner on Sep 29 — Reviewed");
    expect(html).toContain("control evidence log");
    expect(html.match(/data-review-independence="self_review"/g)).toHaveLength(4);
  });
  it("is titled Monthly review, says which record a reviewer relies on, and links nowhere", () => {
    const html = view();
    expect(html).toContain(">Monthly review</h2>");
    expect(html).not.toContain("This month’s file");
    expect(html).toContain(
      "The control evidence log is the record a reviewer relies on. Process Done marks, Decisions log entries and procedure proofs stay on this business and do not enter it.",
    );
    expect(html).not.toContain('href="/firm"');
  });
});

describe("monthly review tells the owner where the result went", () => {
  it("sends today's local date, not the due date, with the result", async () => {
    server.recordMonthlyReview.mockResolvedValue({
      ok: true,
      evidenceBridged: true,
      evidenceSkippedReason: null,
    });
    await press("Done");
    expect(server.recordMonthlyReview).toHaveBeenCalledWith({
      data: expect.objectContaining({
        businessId: "biz_1",
        period: "2026-09",
        dueOn: "2026-10-10",
        result: "done",
        today: "2026-09-29",
      }),
    });
    expect(toast.success).toHaveBeenCalledWith(
      "Saved on this business and recorded in the control evidence log.",
    );
  });
  it("says the deployment does not add monthly notes when the bridge is off", async () => {
    server.recordMonthlyReview.mockResolvedValue({
      ok: true,
      evidenceBridged: false,
      evidenceSkippedReason: "bridge_disabled",
    });
    await press("Done");
    expect(toast.success).toHaveBeenCalledWith("Saved on this business.", {
      description: "Precog does not add monthly notes to the evidence log on this deployment.",
    });
  });
  it("says the evidence log already holds this result for the check and month", async () => {
    server.recordMonthlyReview.mockResolvedValue({
      ok: true,
      evidenceBridged: false,
      evidenceSkippedReason: "already_recorded",
    });
    await press("Done");
    expect(toast.success).toHaveBeenCalledWith("Saved on this business.", {
      description: "The evidence log already holds this result for this check and month.",
    });
  });
  it("gives a plain description, not the server's error, when the entry failed", async () => {
    server.recordMonthlyReview.mockResolvedValue({
      ok: true,
      evidenceBridged: false,
      evidenceSkippedReason: "bridge_failed",
    });
    await press("Done");
    expect(toast.warning).toHaveBeenCalledWith(
      "Saved on this business, but not in the evidence log.",
      { description: "Precog could not add the entry. Press the result again later." },
    );
  });
  it("shows the evidence log's own reason when it refuses the entry", async () => {
    const reason = "This check changed. Reload the log.";
    server.recordMonthlyReview.mockResolvedValue({
      ok: true,
      evidenceBridged: false,
      evidenceSkippedReason: reason,
    });
    await press("Exception (found a problem)", "Vendor added twice");
    expect(toast.warning).toHaveBeenCalledWith(
      "Saved on this business, but not in the evidence log.",
      { description: reason },
    );
    expect(toast.success).not.toHaveBeenCalled();
    expect(JSON.stringify(toast.warning.mock.calls)).not.toContain("signed in");
  });
  it("says the evidence log took a correction when the result changed", async () => {
    server.recordMonthlyReview.mockResolvedValue({
      ok: true,
      evidenceBridged: true,
      evidenceStatus: "corrected",
      evidenceSkippedReason: null,
    });
    await press("Exception (found a problem)", "Vendor added twice");
    expect(toast.success).toHaveBeenCalledWith(
      "Recorded the correction in the control evidence log.",
    );
  });
  it("names the month a check was skipped for", async () => {
    server.recordMonthlyReview.mockResolvedValue({
      ok: true,
      evidenceBridged: false,
      evidenceStatus: null,
      evidenceSkippedReason: null,
    });
    await press("Skipped");
    expect(toast.success).toHaveBeenCalledWith("Skipped for September 2026 on this business.");
  });
  it("says the evidence log withdrew the check when a recorded check is skipped", async () => {
    server.recordMonthlyReview.mockResolvedValue({
      ok: true,
      evidenceBridged: true,
      evidenceStatus: "withdrawn",
      evidenceSkippedReason: null,
    });
    await press("Skipped");
    expect(toast.success).toHaveBeenCalledWith("Skipped for September 2026 on this business.", {
      description: "Precog marked the check withdrawn as skipped in the control evidence log.",
    });
  });
  it("warns when a skip could not withdraw the check's evidence entry", async () => {
    server.recordMonthlyReview.mockResolvedValue({
      ok: true,
      evidenceBridged: false,
      evidenceStatus: null,
      evidenceSkippedReason: "bridge_failed",
    });
    await press("Skipped");
    expect(toast.warning).toHaveBeenCalledWith(
      "Saved on this business, but not in the evidence log.",
      { description: "Precog could not add the entry. Press the result again later." },
    );
    expect(toast.success).not.toHaveBeenCalled();
  });
  it("says a later result for the check replaced this one in the evidence log", async () => {
    server.recordMonthlyReview.mockResolvedValue({
      ok: true,
      evidenceBridged: false,
      evidenceStatus: null,
      evidenceSkippedReason: "superseded",
    });
    await press("Exception (found a problem)", "Vendor added twice");
    expect(toast.success).toHaveBeenCalledWith("Saved on this business.", {
      description:
        "A later result for this check and month replaced this one, so the control evidence log follows that result.",
    });
  });
});

describe("monthly review records last month until its due day", () => {
  it("offers September, due October 10, and October from Oct 1 to Oct 10, September first", () => {
    for (const day of [1, 3, 10]) {
      state.today = new Date(2026, 9, day);
      const html = view();
      expect(html).toContain('aria-label="Month to record"');
      expect(html).toMatch(/aria-pressed="true"[^>]*>September \(due October 10\)<\/button>/);
      expect(html).toMatch(/aria-pressed="false"[^>]*>October<\/button>/);
      // September's four checks, each due Oct 10; October's card statement check is not among them.
      expect(html.match(/2026-09 · due Oct 10, 2026/g)).toHaveLength(4);
      expect(html).not.toContain("Read the company card statement");
    }
  });

  it("opens on the month of the check a Needs attention item names", () => {
    state.today = new Date(2026, 9, 3);
    const html = renderToStaticMarkup(<MonthlyReview focusPeriod="2026-10" />);
    expect(html).toMatch(/aria-pressed="true"[^>]*>October<\/button>/);
    expect(html).toContain('id="check-2026-10-bank_statement"');
    // A month no longer open leaves the default month on screen.
    const closed = renderToStaticMarkup(<MonthlyReview focusPeriod="2026-08" />);
    expect(closed).toMatch(/aria-pressed="true"[^>]*>September \(due October 10\)<\/button>/);
  });

  it("makes the month toggles and the result buttons 44px tall on a touch screen", () => {
    state.today = new Date(2026, 9, 3);
    const html = view();
    const classOf = (label: string) =>
      [...html.matchAll(/<button[^>]*class="([^"]*)"[^>]*>([^<]*)<\/button>/g)]
        .filter((m) => m[2] === label)
        .map((m) => m[1].split(" "));
    for (const label of ["September (due October 10)", "October", "Done", "Skipped"]) {
      const found = classOf(label);
      expect(found.length, label).toBeGreaterThan(0);
      for (const classes of found) {
        expect(classes, label).toContain("pointer-coarse:min-h-11");
        // The mouse layout keeps its compact padding.
        expect(classes, label).toContain("py-1");
      }
    }
    expect(classOf("Exception (found a problem)")[0]).toContain("pointer-coarse:min-h-11");
  });

  it("outlines the check Needs attention opens, so the owner sees which one has focus", () => {
    state.today = new Date(2026, 9, 3);
    const html = renderToStaticMarkup(<MonthlyReview focusPeriod="2026-10" />);
    const classes =
      /<li[^>]*id="check-2026-10-bank_statement"[^>]*class="([^"]*)"|<li[^>]*class="([^"]*)"[^>]*id="check-2026-10-bank_statement"/
        .exec(html)
        ?.slice(1)
        .find(Boolean)
        ?.split(" ");
    expect(classes).toContain("focus:outline-2");
    expect(classes).toContain("focus:outline-primary");
  });

  it("offers this month alone from the 11th", () => {
    state.today = new Date(2026, 9, 11);
    const html = view();
    expect(html).not.toContain("Month to record");
    expect(html.match(/2026-10 · due Nov 10, 2026/g)).toHaveLength(5);
  });

  it("records against the month chosen", async () => {
    vi.setSystemTime(new Date(2026, 9, 3, 9));
    state.today = new Date(2026, 9, 3);
    signIn();
    evidenceLog.getControlExecutionLog.mockResolvedValue(page([]));
    server.recordMonthlyReview.mockResolvedValue({
      ok: true,
      evidenceBridged: true,
      evidenceStatus: "recorded",
      evidenceSkippedReason: null,
    });
    await settle();
    const click = (label: string) =>
      buttons(runtime.render(() => MonthlyReview()))
        .find((b) => b.props.children === label)!
        .props.onClick();
    whoField(
      runtime.render(() => MonthlyReview()),
      BANK,
    ).props.onChange({
      target: { value: "Owner" },
    });
    click("Done");
    await vi.waitFor(() => expect(server.recordMonthlyReview).toHaveBeenCalledTimes(1));
    expect(server.recordMonthlyReview).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        period: "2026-09",
        dueOn: "2026-10-10",
        today: "2026-10-03",
      }),
    });
    click("October");
    expect(await settle()).toMatch(/aria-pressed="true"[^>]*>October<\/button>/);
    // October's check starts empty: September's pick never carries over.
    const octoberWho = whoField(
      runtime.render(() => MonthlyReview()),
      BANK,
    );
    expect(octoberWho.props.value).toBe("");
    octoberWho.props.onChange({ target: { value: "Owner" } });
    click("Done");
    await vi.waitFor(() => expect(server.recordMonthlyReview).toHaveBeenCalledTimes(2));
    expect(server.recordMonthlyReview).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ period: "2026-10", dueOn: "2026-11-10" }),
    });
    // The evidence log is read for the month on screen.
    expect(evidenceLog.getControlExecutionLog).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ period: "2026-10" }),
    });
  });

  it("keeps a note and a save under way with the month they belong to", async () => {
    vi.setSystemTime(new Date(2026, 9, 3, 9));
    state.today = new Date(2026, 9, 3);
    signIn();
    evidenceLog.getControlExecutionLog.mockResolvedValue(page([]));
    await settle();
    const render = () => runtime.render(() => MonthlyReview());
    const click = (label: string) =>
      buttons(render())
        .find((b) => b.props.children === label)!
        .props.onClick();
    const bank = BANK;
    // A note typed under September stays with September.
    noteField(render(), bank).props.onChange({ target: { value: "September statement read." } });
    click("October");
    await settle();
    expect(noteField(render(), bank).props.value).toBe("");
    // October's Done carries October's own (empty) note, not September's.
    whoField(render(), bank).props.onChange({ target: { value: "Owner" } });
    let answer!: (value: unknown) => void;
    server.recordMonthlyReview.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    click("Done");
    await vi.waitFor(() => expect(server.recordMonthlyReview).toHaveBeenCalledTimes(1));
    expect(server.recordMonthlyReview).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ period: "2026-10", itemKey: "bank_statement", notes: "" }),
    });
    // While October's save is under way only October's check waits on it.
    expect(buttons(render()).find((b) => b.props.children === "Done")!.props.disabled).toBe(true);
    click("September (due October 10)");
    await settle();
    expect(noteField(render(), bank).props.value).toBe("September statement read.");
    expect(buttons(render()).find((b) => b.props.children === "Done")!.props.disabled).toBe(false);
    answer({
      ok: true,
      evidenceBridged: true,
      evidenceStatus: "recorded",
      evidenceSkippedReason: null,
    });
    await vi.waitFor(() => expect(toast.success).toHaveBeenCalled());
    // September's note is still there to send with September's result.
    server.recordMonthlyReview.mockResolvedValue({
      ok: true,
      evidenceBridged: true,
      evidenceStatus: "recorded",
      evidenceSkippedReason: null,
    });
    whoField(render(), bank).props.onChange({ target: { value: "Owner" } });
    click("Done");
    await vi.waitFor(() => expect(server.recordMonthlyReview).toHaveBeenCalledTimes(2));
    expect(server.recordMonthlyReview).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        period: "2026-09",
        itemKey: "bank_statement",
        notes: "September statement read.",
      }),
    });
  });
});

describe("monthly review shows the evidence log's state beside a result", () => {
  it("names each of the four states for the check and month's run", () => {
    expect(EVIDENCE_STATUS_LABEL).toEqual({
      awaiting_review: "Awaiting review",
      needs_correction: "Needs correction",
      awaiting_retest: "Awaiting retest",
      reviewed: "Reviewed",
    });
    const statuses = evidenceStatuses([
      { id: "2026-09-payroll_headcount", status: "awaiting_review" },
      { id: "2026-09-bank_statement", status: "needs_correction" },
      { id: "2026-09-new_vendors", status: "awaiting_retest" },
      { id: "2026-09-card_statement", status: "reviewed" },
    ]);
    expect(evidenceLogLine(statuses, "2026-09", "payroll_headcount")).toBe(
      "Evidence log: Awaiting review",
    );
    expect(evidenceLogLine(statuses, "2026-09", "bank_statement")).toBe(
      "Evidence log: Needs correction",
    );
    expect(evidenceLogLine(statuses, "2026-09", "new_vendors")).toBe(
      "Evidence log: Awaiting retest",
    );
    expect(evidenceLogLine(statuses, "2026-09", "card_statement")).toBe("Evidence log: Reviewed");
  });

  it("prints nothing when the log holds no run for the check and month, or was not read", () => {
    const statuses = evidenceStatuses([{ id: "2026-08-payroll_headcount", status: "reviewed" }]);
    expect(evidenceLogLine(statuses, "2026-09", "payroll_headcount")).toBeNull();
    expect(evidenceLogLine(null, "2026-09", "payroll_headcount")).toBeNull();
    state.people = [owner()];
    expect(view()).not.toContain("Evidence log:");
  });
});

/** A page of the month's log as the server answers it. */
function page(
  entries: Pick<ControlExecution, "id" | "status">[],
  nextCursor: string | null = null,
) {
  return { entries, more: nextCursor !== null, nextCursor, canReview: false };
}
/** Runs other than the monthly ones, newest first, as manual checks fill a busy month. */
function manualRuns(count: number, from = 0): Pick<ControlExecution, "id" | "status">[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `manual-${from + i}`,
    status: "awaiting_review" as const,
  }));
}
/** Renders the screen with its effects until nothing changes; returns its markup. */
async function settle(): Promise<string> {
  return renderToStaticMarkup(<>{await runtime.settle(() => MonthlyReview())}</>);
}
function signIn(user: { id: string; isDevFallback?: boolean } = { id: "owner" }) {
  state.people = [owner()];
  state.user = user;
  state.businessId = "biz_1";
}

describe("monthly review reads the evidence log for the month", () => {
  it("reads once, although each render brings a new user object, and prints the run's state", async () => {
    signIn();
    evidenceLog.getControlExecutionLog.mockResolvedValue(
      page([{ id: "2026-09-payroll_headcount", status: "reviewed" }]),
    );
    const html = await settle();
    expect(evidenceLog.getControlExecutionLog).toHaveBeenCalledTimes(1);
    expect(evidenceLog.getControlExecutionLog).toHaveBeenCalledWith({
      data: { businessId: "biz_1", expectedAccountId: "owner", period: "2026-09", cursor: null },
    });
    expect(qbo.getQuickBooksStatus).toHaveBeenCalledTimes(1);
    expect(html).toContain("Evidence log: Reviewed");
    expect(html.match(/Evidence log:/g)).toHaveLength(1);
    // Two answers, two renders after the first; no render asks again.
    expect(runtime.renders).toBeLessThanOrEqual(3);
  });

  it("reads again after a result is recorded, and prints the new state", async () => {
    signIn();
    evidenceLog.getControlExecutionLog.mockResolvedValueOnce(page([]));
    expect(await settle()).not.toContain("Evidence log:");
    server.recordMonthlyReview.mockResolvedValue({
      ok: true,
      evidenceBridged: true,
      evidenceSkippedReason: null,
    });
    evidenceLog.getControlExecutionLog.mockResolvedValueOnce(
      page([{ id: "2026-09-bank_statement", status: "awaiting_review" }]),
    );
    whoField(
      runtime.render(() => MonthlyReview()),
      BANK,
    ).props.onChange({
      target: { value: "Owner" },
    });
    const tree = runtime.render(() => MonthlyReview());
    buttons(tree)
      .find((b) => b.props.children === "Done")!
      .props.onClick();
    await vi.waitFor(() => expect(toast.success).toHaveBeenCalled());
    const html = await settle();
    expect(server.recordMonthlyReview).toHaveBeenCalledTimes(1);
    expect(evidenceLog.getControlExecutionLog).toHaveBeenCalledTimes(2);
    expect(html).toContain("Evidence log: Awaiting review");
  });

  it("follows the log position past page one to a monthly run recorded early in a busy month", async () => {
    signIn();
    evidenceLog.getControlExecutionLog
      .mockResolvedValueOnce(page(manualRuns(20), "manual-19"))
      .mockResolvedValueOnce(
        page([...manualRuns(5, 20), { id: "2026-09-new_vendors", status: "awaiting_retest" }]),
      );
    const html = await settle();
    expect(evidenceLog.getControlExecutionLog).toHaveBeenCalledTimes(2);
    expect(evidenceLog.getControlExecutionLog).toHaveBeenLastCalledWith({
      data: {
        businessId: "biz_1",
        expectedAccountId: "owner",
        period: "2026-09",
        cursor: "manual-19",
      },
    });
    expect(html).toContain("Evidence log: Awaiting retest");
  });

  it("prints no other business's states while the open business's read is under way", async () => {
    signIn();
    evidenceLog.getControlExecutionLog.mockResolvedValueOnce(
      page([{ id: "2026-09-payroll_headcount", status: "reviewed" }]),
    );
    expect(await settle()).toContain("Evidence log: Reviewed");
    // The next business's runs carry the same ids; its read never answers here.
    evidenceLog.getControlExecutionLog.mockReturnValueOnce(new Promise(() => undefined));
    state.businessId = "biz_2";
    const html = await settle();
    expect(evidenceLog.getControlExecutionLog).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ businessId: "biz_2", cursor: null }),
    });
    expect(html).not.toContain("Evidence log:");
  });

  it("does not ask for the shared preview account, which the evidence log refuses", async () => {
    signIn({ id: "dev-user", isDevFallback: true });
    const html = await settle();
    expect(evidenceLog.getControlExecutionLog).not.toHaveBeenCalled();
    expect(html).not.toContain("Evidence log:");
  });

  it("does not ask when signed out or when the business is not saved", async () => {
    state.people = [owner()];
    await settle();
    signIn();
    state.businessId = undefined;
    runtime.reset();
    await settle();
    expect(evidenceLog.getControlExecutionLog).not.toHaveBeenCalled();
    expect(qbo.getQuickBooksStatus).not.toHaveBeenCalled();
  });

  it("prints nothing when the read fails", async () => {
    signIn();
    evidenceLog.getControlExecutionLog.mockRejectedValue(new Error("Failed to fetch"));
    expect(await settle()).not.toContain("Evidence log:");
    expect(evidenceLog.getControlExecutionLog).toHaveBeenCalledTimes(1);
  });
});

describe("readMonthlyEvidence", () => {
  const ids = ["2026-09-bank_statement", "2026-09-payroll_headcount"];

  it("stops once every monthly run is found", async () => {
    const read = vi.fn(async (cursor: string | null): Promise<EvidencePage> =>
      cursor === null
        ? { entries: [{ id: ids[1], status: "reviewed" }], nextCursor: "a" }
        : { entries: [{ id: ids[0], status: "needs_correction" }], nextCursor: "b" },
    );
    const found = await readMonthlyEvidence(read, ids);
    expect(read.mock.calls.map(([cursor]) => cursor)).toEqual([null, "a"]);
    expect(found).toEqual(
      new Map([
        [ids[1], "reviewed"],
        [ids[0], "needs_correction"],
      ]),
    );
  });

  it("stops at the end of the log, keeping what it found", async () => {
    const read = vi.fn(async (): Promise<EvidencePage> => ({
      entries: [{ id: ids[0], status: "reviewed" }],
      nextCursor: null,
    }));
    expect(await readMonthlyEvidence(read, ids)).toEqual(new Map([[ids[0], "reviewed"]]));
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("shows the state of the newest entry when a later result corrected the first", async () => {
    const read = vi.fn(async (): Promise<EvidencePage> => ({
      entries: [
        { id: `${ids[0]}-v2`, status: "needs_correction" },
        { id: ids[0], status: "awaiting_review" },
      ],
      nextCursor: null,
    }));
    expect(await readMonthlyEvidence(read, ids)).toEqual(new Map([[ids[0], "needs_correction"]]));
  });

  it("answers null and reads no further once the screen moved on", async () => {
    let cancelled = false;
    const read = vi.fn(async (): Promise<EvidencePage> => {
      cancelled = true;
      return { entries: [], nextCursor: "a" };
    });
    expect(await readMonthlyEvidence(read, ids, () => cancelled)).toBeNull();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("never reads more pages than a business's log can hold", async () => {
    const read = vi.fn(async (): Promise<EvidencePage> => ({ entries: [], nextCursor: "a" }));
    expect(await readMonthlyEvidence(read, ids)).toEqual(new Map());
    expect(read).toHaveBeenCalledTimes(EVIDENCE_PAGE_LIMIT);
    expect(EVIDENCE_PAGE_LIMIT).toBe(250);
  });
});

describe("monthly review saves who actually did the check", () => {
  const dana = (): Person => ({
    id: "dana",
    name: "Dana",
    role: "Office manager",
    active: true,
    owner: false,
    entitlements: ["view_reports_only"],
  });
  const ok = {
    ok: true,
    evidenceBridged: true,
    evidenceStatus: "recorded",
    evidenceSkippedReason: null,
  };
  const render = () => runtime.render(() => MonthlyReview());
  const click = (label: string, index = 0) =>
    buttons(render())
      .filter((b) => b.props.children === label)
      [index].props.onClick();
  /** What the screen saved on the business, from the last `setMonthlyReviews` updater. */
  function savedLocally(): ReviewRecord[] {
    const update = practice.setMonthlyReviews.mock.calls.at(-1)?.[0] as
      ((current: ReviewRecord[]) => ReviewRecord[]) | undefined;
    return update ? update([]) : [];
  }

  it("saves the person picked, not the suggested owner", async () => {
    // Dana holds no checked duty, so Precog suggests her for the bank statement.
    state.people = [owner(), dana()];
    state.user = { id: "owner" };
    state.businessId = "biz_1";
    server.recordMonthlyReview.mockResolvedValue(ok);
    const html = await settle();
    expect(html).toContain("Suggested: Dana");
    expect(whoField(render(), BANK).props.value).toBe("");
    whoField(render(), BANK).props.onChange({ target: { value: "Owner" } });
    click("Done");
    await vi.waitFor(() => expect(server.recordMonthlyReview).toHaveBeenCalledTimes(1));
    expect(server.recordMonthlyReview).toHaveBeenCalledWith({
      data: expect.objectContaining({ itemKey: "bank_statement", ownerName: "Owner" }),
    });
    expect(savedLocally()[0]).toMatchObject({ key: "bank_statement", ownerName: "Owner" });
  });

  it("saves the name typed under Someone else", async () => {
    state.people = [owner(), dana()];
    await settle();
    whoField(render(), BANK).props.onChange({ target: { value: "__someone_else__" } });
    otherNameField(render(), BANK).props.onChange({ target: { value: "Jordan Blake" } });
    click("Done");
    expect(savedLocally()[0]).toMatchObject({ ownerName: "Jordan Blake", result: "done" });
  });

  it("offers the active team and Someone else, and leaves out people who left", () => {
    state.people = [owner(), dana(), { ...dana(), id: "gone", name: "Gone Person", active: false }];
    const html = view();
    expect(html).toContain('aria-label="Who did Open the bank statement"');
    expect(html).toContain("Who did this check");
    expect(html).toContain('<option value="Dana">Dana</option>');
    expect(html).toContain(">Someone else</option>");
    expect(html).not.toContain("Gone Person</option>");
  });

  it("refuses a result until someone is picked", async () => {
    state.people = [owner(), dana()];
    await settle();
    click("Done");
    expect(practice.setMonthlyReviews).not.toHaveBeenCalled();
    expect(server.recordMonthlyReview).not.toHaveBeenCalled();
    expect(await settle()).toContain("Choose who did this check.");
  });

  it("refuses an Exception with a blank note and says what to do", async () => {
    state.people = [owner()];
    await settle();
    whoField(render(), BANK).props.onChange({ target: { value: "Owner" } });
    click("Exception (found a problem)");
    expect(practice.setMonthlyReviews).not.toHaveBeenCalled();
    expect(await settle()).toContain("Say what you found.");
    noteField(render(), BANK).props.onChange({ target: { value: "Check 1043 payable to cash" } });
    click("Exception (found a problem)");
    expect(savedLocally()[0]).toMatchObject({
      result: "exception",
      notes: "Check 1043 payable to cash",
      ownerName: "Owner",
    });
  });

  it("explains Exception in one line on the screen and keeps the report's label", () => {
    state.people = [owner()];
    const html = view();
    expect(html).toContain(">Exception (found a problem)</button>");
    expect(html).toContain("Press Exception when the check turned up a problem");
  });

  it("marks the latest result's button as pressed and shows a lasting Saved line", () => {
    state.people = [owner()];
    state.records = [
      {
        key: "bank_statement",
        period: "2026-09",
        result: "exception",
        ownerName: "Dana",
        notes: "Deposit of Sep 12 missing",
        recordedAt: "2026-09-29T12:00:00Z",
      },
      {
        key: "bank_statement",
        period: "2026-09",
        result: "done",
        ownerName: "Dana",
        notes: "",
        recordedAt: "2026-09-20T12:00:00Z",
      },
    ];
    const html = view();
    expect(html).toContain("Saved: Exception by Dana on Sep 29 — Deposit of Sep 12 missing");
    const bank = buttons(MonthlyReviewTree()).slice(0, 3);
    expect(bank.map((b) => [b.props.children, b.props["aria-pressed"]])).toEqual([
      ["Done", false],
      ["Exception (found a problem)", true],
      ["Skipped", false],
    ]);
    // A check with no result has nothing pressed.
    expect(
      buttons(MonthlyReviewTree())
        .slice(3)
        .filter((b) => ["Done", "Skipped"].includes(String(b.props.children)))
        .every((b) => b.props["aria-pressed"] === false),
    ).toBe(true);
  });

  it("records Done with a Resolved note when Mark resolved is pressed", async () => {
    state.people = [owner()];
    state.records = [
      {
        key: "bank_statement",
        period: "2026-09",
        result: "exception",
        ownerName: "Owner",
        notes: "Deposit of Sep 12 missing",
        recordedAt: "2026-09-29T08:00:00Z",
      },
    ];
    const html = await settle();
    expect(html.match(/>Mark resolved<\/button>/g)).toHaveLength(1);
    whoField(render(), BANK).props.onChange({ target: { value: "Owner" } });
    noteField(render(), BANK).props.onChange({
      target: { value: "Found it in the Sep 13 deposit" },
    });
    click("Mark resolved");
    expect(savedLocally()[0]).toMatchObject({
      key: "bank_statement",
      result: "done",
      ownerName: "Owner",
      notes: "Resolved: Found it in the Sep 13 deposit",
    });
  });

  it("gives each check an id other screens can open it by", () => {
    state.people = [owner()];
    const html = view();
    expect(html).toContain('id="check-2026-09-bank_statement"');
    expect(html).toContain('id="check-2026-09-new_vendors"');
  });

  it("says a typed note is not saved yet, and warns before the page closes", async () => {
    state.people = [owner()];
    const target = new EventTarget();
    vi.stubGlobal("window", target);
    try {
      await settle();
      noteField(render(), BANK).props.onChange({ target: { value: "Half done" } });
      expect(await settle()).toContain("Not saved yet: press a result");
      const leave = new Event("beforeunload", { cancelable: true });
      target.dispatchEvent(leave);
      expect(leave.defaultPrevented).toBe(true);
      // Once saved, nothing waits and the page closes quietly.
      whoField(render(), BANK).props.onChange({ target: { value: "Owner" } });
      click("Done");
      expect(await settle()).not.toContain("Not saved yet");
      const later = new Event("beforeunload", { cancelable: true });
      target.dispatchEvent(later);
      expect(later.defaultPrevented).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("starts every other check's picker empty after a save, so Done never credits an unchosen person", async () => {
    state.people = [owner(), dana()];
    await settle();
    whoField(render(), BANK).props.onChange({ target: { value: "Dana" } });
    click("Done");
    // The saved check keeps its own pick; the next check waits for a choice.
    expect(whoField(render(), BANK).props.value).toBe("Dana");
    expect(whoField(render(), "Read the cleared-check images").props.value).toBe("");
    runtime.reset();
    await settle();
    expect(whoField(render(), BANK).props.value).toBe("");
  });

  it("opens with a plain sentence and keeps the evidence-log detail under How this works", () => {
    const html = view();
    expect(html).not.toContain("come from the register");
    expect(html).toContain(
      "Do each check below. Choose who did it, then press Done, or Exception if you found a problem and say what you found.",
    );
  });
});

/** One render of the screen as a plain tree, through the hook runtime. */
function MonthlyReviewTree(): ReactNode {
  return runtime.render(() => MonthlyReview());
}

describe("monthly review never saves a name that left the team", () => {
  it("empties the pick of someone no longer active", async () => {
    state.people = [owner(), { ...owner(), id: "lee", name: "Lee", owner: false }];
    await settle();
    const render = () => runtime.render(() => MonthlyReview());
    whoField(render(), BANK).props.onChange({ target: { value: "Lee" } });
    state.people = [owner(), { ...owner(), id: "lee", name: "Lee", owner: false, active: false }];
    expect(whoField(render(), BANK).props.value).toBe("");
    buttons(render())
      .find((b) => b.props.children === "Done")!
      .props.onClick();
    expect(practice.setMonthlyReviews).not.toHaveBeenCalled();
  });
});

describe("monthly review says what each check covers", () => {
  it("prints one plain line under every check's title, the November checks included", () => {
    state.people = [owner()];
    const september = view();
    for (const item of REVIEW_ITEMS.filter((i) => !i.since)) {
      const task = monthlyReviewTasks("2026-09-29", state.people, {}, "2026-09").find(
        (t) => t.key === item.key,
      )!;
      expect(september).toContain(`data-covers="${item.key}"`);
      expect(september).toContain(escape(task.covers));
    }
    expect(september).toContain(
      "Checks your business wrote that cleared the bank. A check you received, or a bill paid twice, belongs under Another problem.",
    );
    state.today = new Date(2026, 10, 20);
    vi.setSystemTime(new Date(2026, 10, 20, 9));
    const november = view();
    const tasks = monthlyReviewTasks("2026-11-20", state.people, {}, "2026-11");
    expect(tasks.map((t) => t.key)).toEqual(REVIEW_ITEMS.map((i) => i.key));
    for (const task of tasks) {
      expect(november).toContain(`data-covers="${task.key}"`);
      expect(november).toContain(escape(task.covers));
    }
  });
});

describe("monthly review records another problem this month", () => {
  const render = () => runtime.render(() => MonthlyReview());
  const click = (label: string) =>
    buttons(render())
      .find((b) => b.props.children === label)!
      .props.onClick();
  const field = (label: string) => {
    const found = [...elements(render(), "select"), ...elements(render(), "input")].find(
      (e) => (e as unknown as Input).props["aria-label"] === label,
    );
    if (!found) throw new Error(`No field ${label}`);
    return found as unknown as Input;
  };
  function savedLocally(): ReviewRecord[] {
    const update = practice.setMonthlyReviews.mock.calls.at(-1)?.[0] as
      ((current: ReviewRecord[]) => ReviewRecord[]) | undefined;
    return update ? update([]) : [];
  }
  const DONATION = "A family's mailed donation check never reached the bank";

  it("ends each month's list with the entry, its picker empty", () => {
    state.people = [owner()];
    const html = view();
    expect(html).toContain('id="check-2026-09-other_problem"');
    expect(html).toContain("Record another problem this month");
    expect(html.lastIndexOf("data-covers=")).toBeLessThan(html.indexOf("Record another problem"));
    expect(html).toContain(">Record the problem</button>");
    expect(field("Who found another problem").props.value).toBe("");
  });

  it("saves an Exception under the person and month chosen, with the note, and nothing for the server", async () => {
    state.people = [owner()];
    state.user = { id: "owner" };
    state.businessId = "biz_1";
    await settle();
    field("Who found another problem").props.onChange({ target: { value: "Owner" } });
    field("Note for another problem").props.onChange({ target: { value: DONATION } });
    click("Record the problem");
    expect(savedLocally()).toEqual([
      expect.objectContaining({
        key: "other_problem",
        period: "2026-09",
        result: "exception",
        ownerName: "Owner",
        notes: DONATION,
      }),
    ]);
    // Not a check: no monthly review log entry, so no count and no evidence log entry moves.
    expect(server.recordMonthlyReview).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Saved on this business.", {
      description:
        "Another problem is not a check: it does not change how many checks are done, and it does not go into the control evidence log.",
    });
    // The next problem waits for its own choice of person.
    expect(field("Who found another problem").props.value).toBe("");
  });

  it("refuses without a person or without a note", async () => {
    state.people = [owner()];
    await settle();
    field("Note for another problem").props.onChange({ target: { value: DONATION } });
    click("Record the problem");
    expect(practice.setMonthlyReviews).not.toHaveBeenCalled();
    expect(await settle()).toContain("Choose who found it.");
    field("Note for another problem").props.onChange({ target: { value: " " } });
    field("Who found another problem").props.onChange({ target: { value: "Owner" } });
    click("Record the problem");
    expect(practice.setMonthlyReviews).not.toHaveBeenCalled();
    expect(await settle()).toContain("Say what the problem is.");
  });

  it("lists it in the month and marks it resolved, leaving every check as it was", async () => {
    state.people = [owner()];
    state.records = [
      {
        key: "other_problem",
        period: "2026-09",
        result: "exception",
        ownerName: "Owner",
        notes: DONATION,
        recordedAt: "2026-09-28T15:00:00.000Z",
      },
    ];
    const html = await settle();
    expect(html).toContain(`Another problem: ${escape(DONATION)} — found by Owner on Sep 28`);
    expect(html).toContain('id="check-2026-09-other_problem-20260928150000000"');
    // Every check still has no result.
    expect(html).not.toContain("data-saved-result");
    expect(html.match(/>Mark resolved<\/button>/g)).toHaveLength(1);
    click("Mark resolved");
    expect(practice.setMonthlyReviews).not.toHaveBeenCalled();
    expect(await settle()).toContain("Choose who resolved it.");
    field(`Who resolved: ${DONATION}`).props.onChange({ target: { value: "Owner" } });
    click("Mark resolved");
    expect(savedLocally()[0]).toMatchObject({
      key: "other_problem",
      period: "2026-09",
      result: "done",
      ownerName: "Owner",
      notes: `Resolved: ${DONATION}`,
      resolves: "2026-09-28T15:00:00.000Z",
    });
    expect(server.recordMonthlyReview).not.toHaveBeenCalled();
  });
});

/** Text as renderToStaticMarkup escapes it. */
function escape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");
}
