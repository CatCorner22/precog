import { isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReportVersionRow } from "@/lib/precog/firm/reports";
import { createHookRuntime, type HookRuntime } from "@/test/hook-runtime";
import { ReportVersionsPanel } from "./report-versions";
import { SHARED_BUSINESS_NOTE } from "./report-versions-actions";

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
const state = vi.hoisted(() => ({ userId: "bea", firmClient: true }));
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
    businesses: [{ id: "biz_1", firmClient: state.firmClient }],
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
const plans = vi.hoisted(() => ({ getEntitlements: vi.fn() }));
vi.mock("@/lib/precog/firm/entitlements-server", () => plans);
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

/**
 * The panel for `viewer` (with `role` at the firm, or null in no firm) over
 * `versions`, after its loads settle. `lockedVersions` is what the viewer's
 * plan answers. `work` is what the versions list says the viewer does on the
 * business: by default the viewer's role, in the business's firm for a firm
 * client (listReports in firm/server.ts).
 */
async function panel(
  viewer: string,
  role: string | null,
  versions: ReportVersionRow[],
  lockedVersions = true,
  work: { firm: boolean; role: string | null } = { firm: state.firmClient, role },
) {
  state.userId = viewer;
  server.listReports.mockResolvedValue({ versions, work });
  server.getFirm.mockResolvedValue({ firm: role ? { role } : null });
  plans.getEntitlements.mockResolvedValue({ features: { lockedVersions } });
  const tree = await runtime.settle(() => ReportVersionsPanel());
  return { tree, labels: labels(tree), html: renderToStaticMarkup(<>{tree}</>) };
}

beforeEach(() => {
  runtime.reset();
  state.firmClient = true;
  for (const fn of Object.values(server)) fn.mockReset();
  plans.getEntitlements.mockReset();
});
afterEach(() => runtime.reset());

describe("report versions panel", () => {
  it("loads the versions and the role once, although each render brings a new user object", async () => {
    await panel("bea", "reviewer", [version({})]);
    expect(server.listReports).toHaveBeenCalledTimes(1);
    expect(server.listReports).toHaveBeenCalledWith({ data: { businessId: "biz_1" } });
    expect(server.getFirm).toHaveBeenCalledTimes(1);
    // The plan matters only to an account in no firm; a firm member's is not read.
    expect(plans.getEntitlements).not.toHaveBeenCalled();
    expect(runtime.renders).toBeLessThanOrEqual(3);
  });

  describe("on a business its owner shared with a firm, for that owner", () => {
    const open = () => version({ id: "rv_3", versionNo: 3 });
    const reviewed = () =>
      version({
        id: "rv_2",
        versionNo: 2,
        reviewedBy: "bea",
        reviewedAt: "2026-10-06T09:00:00.000Z",
      });
    // Locked by the owner alone, before the business was shared.
    const ownEarlier = () => version({ id: "rv_1", versionNo: 1, preparedBy: "bo" });
    const versions = () => [open(), reviewed(), ownEarlier()];

    it("offers Open alone, and says the firm does the work", async () => {
      const { labels: names, html } = await panel("bo", null, versions(), true, {
        firm: true,
        role: null,
      });
      expect(names).toEqual([
        "Report versions",
        "Open version 3",
        "Open version 2",
        "Open version 1",
      ]);
      expect(html).not.toContain("Lock this version");
      expect(html).toContain(SHARED_BUSINESS_NOTE);
    });

    it("offers no review although the owner runs a firm of their own", async () => {
      const { labels: names, html } = await panel("bo", "owner", versions(), true, {
        firm: true,
        role: null,
      });
      expect(names.filter((n) => !n.startsWith("Open version") && n !== "Report versions")).toEqual(
        [],
      );
      expect(html).not.toContain("Lock this version");
    });

    it("keeps every button for the firm's own reviewer", async () => {
      const { labels: names, html } = await panel("bea", "reviewer", versions());
      expect(html).toContain("Lock this version");
      expect(names).toContain("Review version 3 for issuance");
      expect(names).toContain("Mark version 2 as sent");
      expect(names).toContain("Share version 2");
      expect(html).not.toContain(SHARED_BUSINESS_NOTE);
    });
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

  describe("Share on a reviewed version", () => {
    const reviewed = () => version({ reviewedBy: "ada", reviewedAt: "2026-10-06T09:00:00.000Z" });

    it("shows for a firm's client", async () => {
      const { labels: names } = await panel("bea", "reviewer", [reviewed()]);
      expect(names).toContain("Share version 1");
    });

    it("shows for a solo owner in no firm whose plan allows locked versions", async () => {
      state.firmClient = false;
      const { labels: names } = await panel("ada", null, [reviewed()]);
      expect(names).toContain("Share version 1");
      expect(plans.getEntitlements).toHaveBeenCalledTimes(1);
      // Not before the version is reviewed for issuance.
      runtime.reset();
      expect((await panel("ada", null, [version({})])).labels).not.toContain("Share version 1");
    });

    it("hides for a solo owner on the free plan, or when the plan cannot be read", async () => {
      state.firmClient = false;
      expect((await panel("ada", null, [reviewed()], false)).labels).not.toContain(
        "Share version 1",
      );
      runtime.reset();
      state.userId = "ada";
      server.listReports.mockResolvedValue({ versions: [reviewed()] });
      server.getFirm.mockResolvedValue({ firm: null });
      plans.getEntitlements.mockRejectedValue(new Error("offline"));
      const tree = await runtime.settle(() => ReportVersionsPanel());
      expect(labels(tree)).toContain("Open version 1");
      expect(labels(tree)).not.toContain("Share version 1");
    });

    it("hides on a firm member's private business although the firm's plan is open", async () => {
      state.firmClient = false;
      const { labels: names } = await panel("ada", "preparer", [reviewed()]);
      expect(names).not.toContain("Share version 1");
    });
  });
});
