import { isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Person } from "@/lib/precog/types";
import type { ReviewRecord } from "@/lib/precog/firm/reviews";
import { MonthlyReview } from "./monthly-review";

const state = vi.hoisted(() => ({
  people: [] as Person[],
  records: [] as ReviewRecord[],
  user: null as { id: string } | null,
  businessId: undefined as string | undefined,
}));
// Called as a plain function (`direct`), the screen keeps its first state and
// runs no effects, so a test can press its buttons without a DOM renderer.
const hooks = vi.hoisted(() => ({ direct: false }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (init: unknown) =>
      hooks.direct
        ? [typeof init === "function" ? (init as () => unknown)() : init, () => undefined]
        : actual.useState(init),
    useEffect: (effect: () => void, deps?: unknown[]) =>
      hooks.direct ? undefined : actual.useEffect(effect, deps),
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
vi.mock("@/lib/auth/use-current-user", () => ({ useCurrentUser: () => state.user }));
vi.mock("@/lib/use-today", () => ({ useToday: () => new Date(2026, 8, 29) }));
vi.mock("@/lib/precog/firm/server", () => server);
vi.mock("@/lib/precog/integrations/qbo/server", () => ({
  getQuickBooksStatus: vi.fn(async () => ({ configured: false, connection: null, drift: null })),
}));

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
type Button = { props: { children: unknown; onClick: () => void } };
function buttons(node: ReactNode): Button[] {
  if (Array.isArray(node)) return node.flatMap(buttons);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  const own = node.type === "button" ? [node as unknown as Button] : [];
  return [...own, ...buttons(node.props.children)];
}

beforeEach(() => {
  state.people = [];
  state.records = [];
  state.user = null;
  state.businessId = undefined;
  server.recordMonthlyReview.mockReset();
  for (const fn of Object.values(toast)) fn.mockReset();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 29, 9));
});
afterEach(() => {
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
  it("says the evidence log keeps the first result for the check and month", async () => {
    server.recordMonthlyReview.mockResolvedValue({
      ok: true,
      evidenceBridged: false,
      evidenceSkippedReason: "already_recorded",
    });
    await press("Done");
    expect(toast.success).toHaveBeenCalledWith("Saved on this business.", {
      description:
        "The evidence log keeps the first result for this check and month. The monthly log keeps this one.",
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
});
