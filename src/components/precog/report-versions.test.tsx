import { isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReportVersionRow } from "@/lib/precog/firm/reports";
import { createHookRuntime, type HookRuntime } from "@/test/hook-runtime";
import { ReportVersionsPanel } from "./report-versions";

// The panel runs as a plain function under src/test/hook-runtime.ts: state
// persists and effects run as React runs them, so a test sees how often the
// panel calls the server and which buttons each viewer gets.
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
const state = vi.hoisted(() => ({ userId: "bea" }));
// A new object on every call, as the real session hook builds one on every render.
vi.mock("@/lib/auth/use-current-user", () => ({
  useCurrentUserState: () => ({
    user: { id: state.userId, displayName: null, isDevFallback: false },
    isPending: false,
  }),
}));
vi.mock("@/lib/precog/practice-context", () => ({
  usePractice: () => ({
    profile: { businessId: "biz_1", practiceName: "Acme" },
    businesses: [{ id: "biz_1", firmClient: true }],
    replaceProfile: vi.fn(),
  }),
  usePracticeSync: () => ({ syncStatus: "synced" }),
}));
vi.mock("@/lib/precog/firm/engagement", () => ({ isOwnTeam: () => true }));
const server = vi.hoisted(() => ({
  getFirm: vi.fn(),
  listReports: vi.fn(),
  lockReport: vi.fn(),
  markReportSent: vi.fn(),
  signOffReport: vi.fn(),
}));
vi.mock("@/lib/precog/firm/server", () => server);
vi.mock("@/lib/precog/firm/review-server", () => ({
  requestReportReview: vi.fn(),
  returnReport: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("./report-share-panel", () => ({ ReportSharePanel: () => null }));

const runtime = createHookRuntime();
hooks.runtime = runtime;

function version(patch: Partial<ReportVersionRow>): ReportVersionRow {
  return {
    id: "rv_1",
    businessId: "biz_1",
    versionNo: 1,
    revision: 1,
    scopeNote: "",
    preparedBy: "ada",
    preparedByName: "Ada Park",
    preparedAt: "2026-10-05T12:00:00.000Z",
    reviewedBy: null,
    reviewedByName: null,
    reviewedAt: null,
    reviewNote: "",
    sentAt: null,
    hasFigures: true,
    firm: null,
    engagement: null,
    reviewRequestedAt: null,
    reviewRequestedFrom: null,
    reviewRequestedFromName: null,
    returnedAt: null,
    returnedBy: null,
    returnedByName: null,
    returnNote: "",
    ...patch,
  };
}

/** Every accessible name in the tree, from host elements and components alike. */
function labels(node: ReactNode): string[] {
  if (Array.isArray(node)) return node.flatMap(labels);
  if (!isValidElement<{ children?: ReactNode; "aria-label"?: string }>(node)) return [];
  const own = node.props["aria-label"] ? [node.props["aria-label"]] : [];
  return [...own, ...labels(node.props.children)];
}

/** The panel for `viewer` (with `role` at the firm) over `versions`, after its loads settle. */
async function panel(viewer: string, role: string, versions: ReportVersionRow[]) {
  state.userId = viewer;
  server.listReports.mockResolvedValue({ versions });
  server.getFirm.mockResolvedValue({ firm: { role } });
  const tree = await runtime.settle(() => ReportVersionsPanel());
  return { tree, labels: labels(tree), html: renderToStaticMarkup(<>{tree}</>) };
}

beforeEach(() => {
  runtime.reset();
  for (const fn of Object.values(server)) fn.mockReset();
});
afterEach(() => runtime.reset());

describe("report versions panel", () => {
  it("loads the versions and the role once, although each render brings a new user object", async () => {
    await panel("bea", "reviewer", [version({})]);
    expect(server.listReports).toHaveBeenCalledTimes(1);
    expect(server.listReports).toHaveBeenCalledWith({ data: { businessId: "biz_1" } });
    expect(server.getFirm).toHaveBeenCalledTimes(1);
    expect(runtime.renders).toBeLessThanOrEqual(3);
  });

  it("gives a reviewer who did not prepare a version Review for issuance and Return to preparer", async () => {
    const { labels: names } = await panel("bea", "reviewer", [version({})]);
    expect(names).toContain("Review version 1 for issuance");
    expect(names).toContain("Return version 1 to its preparer");
    expect(names).not.toContain("Ask for review of version 1");
  });

  it("gives the preparer Ask for review and Issue without an independent review", async () => {
    const { labels: names, html } = await panel("ada", "preparer", [version({})]);
    expect(names).toContain("Ask for review of version 1");
    expect(names).toContain("Issue version 1 without an independent review");
    expect(names).not.toContain("Return version 1 to its preparer");
    expect(html).toContain("Ask for review");
  });

  it("shows a returned version's note and no review button", async () => {
    const returned = version({
      reviewRequestedAt: "2026-10-06T09:00:00.000Z",
      returnedAt: "2026-10-07T09:00:00.000Z",
      returnedBy: "bea",
      returnedByName: "Bea Lin",
      returnNote: "Add the payroll duties.",
    });
    for (const [viewer, role] of [
      ["ada", "preparer"],
      ["bea", "reviewer"],
      ["own", "owner"],
    ]) {
      runtime.reset();
      const { labels: names, html } = await panel(viewer, role, [returned]);
      expect(html).toContain("Returned: Add the payroll duties.");
      expect(names.filter((n) => n !== "Open version 1" && n !== "Report versions")).toEqual([]);
    }
  });
});
