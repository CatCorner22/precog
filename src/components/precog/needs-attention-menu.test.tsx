import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MONTHLY_REVIEW_GRACE_DAY,
  openMonthlyChecks,
  type ReviewRecord,
} from "@/lib/precog/firm/reviews";
import type { Person } from "@/lib/precog/types";
import { buildNeedsAttentionItems, openNeedsAttentionItem } from "./needs-attention-menu.logic";
import { NeedsAttentionMenu } from "./needs-attention-menu";

const state = vi.hoisted(() => ({
  today: new Date(2026, 9, 5),
  records: [] as ReviewRecord[],
  owner: {
    id: "owner",
    name: "Owner",
    role: "Owner",
    active: true,
    owner: true,
    entitlements: ["enter_payroll", "sign_checks", "bank_reconcile", "create_vendor"],
  } as Person,
}));
const owner = state.owner;
vi.mock("@/lib/use-today", () => ({ useToday: () => state.today }));
vi.mock("@/lib/precog/practice-context", async () => {
  const { getIndustryTemplate: template } = await import("@/lib/precog/templates");
  const tpl = { ...template("general"), people: [state.owner], roleTemplates: {} };
  return {
    useTemplate: () => tpl,
    usePracticeState: () => ({
      profile: {
        industry: "general",
        decisions: [],
        leaverAccessChecks: [],
        monthlyReviews: state.records,
      },
    }),
  };
});

const view = () => renderToStaticMarkup(<NeedsAttentionMenu onOpen={() => undefined} />);

beforeEach(() => {
  state.records = [];
});

describe("open monthly checks", () => {
  it("counts none before the 5th and every check without a result from the 5th", () => {
    expect(MONTHLY_REVIEW_GRACE_DAY).toBe(5);
    expect(openMonthlyChecks("2026-10-04", [owner], {}, [])).toBe(0);
    expect(openMonthlyChecks("2026-10-05", [owner], {}, [])).toBe(5);
    const done: ReviewRecord = {
      key: "bank_statement",
      period: "2026-10",
      result: "done",
      ownerName: "Owner",
      notes: "",
      recordedAt: "2026-10-05T12:00:00Z",
    };
    expect(openMonthlyChecks("2026-10-05", [owner], {}, [done])).toBe(4);
    // A result for last month does not close this month's check.
    expect(openMonthlyChecks("2026-10-05", [owner], {}, [{ ...done, period: "2026-09" }])).toBe(5);
  });
});

describe("Needs attention menu", () => {
  it("stays hidden on the 4th when only the month's checks are open", () => {
    state.today = new Date(2026, 9, 4);
    expect(view()).toBe("");
  });

  it("counts the month's open checks from the 5th, as the reminders do", () => {
    state.today = new Date(2026, 9, 5);
    expect(view()).toContain("Needs attention (5)");
  });

  it("opens a leaver reminder at the leaving section", () => {
    const [leavers] = buildNeedsAttentionItems({
      overdue: 0,
      slipped: 0,
      leavers: 1,
      monthly: 0,
    });
    const onOpen = vi.fn();

    openNeedsAttentionItem(leavers, onOpen);

    expect(onOpen).toHaveBeenCalledWith("knowledge", "leaving");
  });

  it("opens monthly reminders at checks and keeps journal reminders on their alias", () => {
    const items = buildNeedsAttentionItems({
      overdue: 1,
      slipped: 1,
      leavers: 0,
      monthly: 1,
    });
    const onOpen = vi.fn();

    openNeedsAttentionItem(
      items.find((item) => item.id === "monthly")!,
      onOpen,
    );
    expect(onOpen).toHaveBeenLastCalledWith("monthly", "checks");

    openNeedsAttentionItem(
      items.find((item) => item.id === "overdue")!,
      onOpen,
    );
    expect(onOpen).toHaveBeenLastCalledWith("journal");
  });
});
