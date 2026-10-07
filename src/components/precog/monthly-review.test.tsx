import { isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Person } from "@/lib/precog/types";
import type { ReviewRecord } from "@/lib/precog/firm/reviews";
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
// Called as a plain function (`direct`), the screen keeps its first state and
// runs no effects, so a test can press its buttons without a DOM renderer.
// Under `hooks.runtime` (src/test/hook-runtime.ts) state persists and effects
// run as React runs them, so a test sees how often the screen calls the server.
const hooks = vi.hoisted(() => ({ direct: false, runtime: null as HookRuntime | null }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (init: unknown) =>
      hooks.runtime?.active
        ? hooks.runtime.useState(init)
        : hooks.direct
          ? [typeof init === "function" ? (init as () => unknown)() : init, () => undefined]
          : actual.useState(init),
    useEffect: (effect: () => void, deps?: unknown[]) =>
      hooks.runtime?.active
        ? hooks.runtime.useEffect(effect, deps)
        : hooks.direct
          ? undefined
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
vi.mock("@/lib/precog/practice-context", () => ({
  usePractice: () => ({
    profile: { monthlyReviews: state.records, businessId: state.businessId },
    template: { people: state.people, roleTemplates: {} },
    setMonthlyReviews: vi.fn(),
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

/** Presses the first check's result button, as a signed-in owner of a saved business. */
async function press(label: string) {
  state.user = { id: "owner" };
  state.businessId = "biz_1";
  hooks.direct = true;
  let tree: ReactNode;
  try {
    tree = MonthlyReview();
  } finally {
    hooks.direct = false;
  }
  const button = buttons(tree).find((b) => b.props.children === label);
  if (!button) throw new Error(`No ${label} button`);
  button.props.onClick();
  await vi.waitFor(() =>
    expect(Object.values(toast).some((fn) => fn.mock.calls.length > 0)).toBe(true),
  );
}
type Button = { props: { children: unknown; onClick: () => void; disabled?: boolean } };
function buttons(node: ReactNode): Button[] {
  return elements(node, "button") as unknown as Button[];
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
    expect(html).toContain("Reported result: Done");
    expect(html).toContain("control evidence log");
    expect(html.match(/data-review-independence="self_review"/g)).toHaveLength(4);
  });
  it("is titled Monthly review, says which record a reviewer relies on, and links nowhere", () => {
    const html = view();
    expect(html).toContain(">Monthly review</h2>");
    expect(html).not.toContain("This month’s file");
    expect(html).toContain(
      "Reviewers rely on this log. Done marks on processes, Decisions log entries and procedure proofs stay on the business and are not part of it.",
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
    await press("Exception");
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
    await press("Exception");
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
    await press("Exception");
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
    const bank = "Open the bank statement";
    // A note typed under September stays with September.
    noteField(render(), bank).props.onChange({ target: { value: "September statement read." } });
    click("October");
    await settle();
    expect(noteField(render(), bank).props.value).toBe("");
    // October's Done carries October's own (empty) note, not September's.
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
