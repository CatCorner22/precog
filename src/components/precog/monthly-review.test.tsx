import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Person } from "@/lib/precog/types";
import type { ReviewRecord } from "@/lib/precog/firm/reviews";
import { MonthlyReview } from "./monthly-review";

const state = vi.hoisted(() => ({ people: [] as Person[], records: [] as ReviewRecord[] }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock("@/lib/precog/practice-context", () => ({
  usePractice: () => ({
    profile: { monthlyReviews: state.records },
    template: { people: state.people, roleTemplates: {} },
    setMonthlyReviews: vi.fn(),
  }),
}));
vi.mock("@/lib/auth/use-current-user", () => ({ useCurrentUser: () => null }));
vi.mock("@/lib/use-today", () => ({ useToday: () => new Date(2026, 8, 29) }));
vi.mock("@/lib/precog/firm/server", () => ({ recordMonthlyReview: vi.fn() }));
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

beforeEach(() => {
  state.people = [];
  state.records = [];
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
