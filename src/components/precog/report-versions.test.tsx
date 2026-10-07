import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReportVersionRow } from "@/lib/precog/firm/reports";
import { createHookRuntime, type HookRuntime } from "@/test/hook-runtime";
import { OpenVersionReview, ReportVersionsPanel } from "./report-versions";
import { SHARED_BUSINESS_NOTE, withdrawConfirmText } from "./report-versions-actions";

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
  withdrawReportReview: vi.fn(),
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
    reviewOverrideNote: null,
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

type Props = {
  children?: ReactNode;
  "aria-label"?: string;
  role?: string;
  disabled?: boolean;
  onClick?: () => void;
  onChange?: (e: { target: { value: string } }) => void;
};

/** Every element in the tree that `match` accepts, in document order. */
function findAll(
  node: ReactNode,
  match: (el: ReactElement<Props>) => boolean,
): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap((n) => findAll(n, match));
  if (!isValidElement<Props>(node)) return [];
  return [...(match(node) ? [node] : []), ...findAll(node.props.children, match)];
}

/** The text an element shows, from its string children. */
function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  return isValidElement<Props>(node) ? textOf(node.props.children) : "";
}

/** Clicks the element with this accessible name. */
function click(tree: ReactNode, label: string) {
  const [el] = findAll(tree, (e) => e.props["aria-label"] === label);
  if (!el?.props.onClick) throw new Error(`No button named ${label}`);
  el.props.onClick();
}

/** The clickable element showing `text`, inside the first element with `role` when given. */
function button(tree: ReactNode, text: string, role?: string): ReactElement<Props> {
  const scope = role ? findAll(tree, (e) => e.props.role === role)[0] : tree;
  const [el] = findAll(
    scope,
    (e) => typeof e.props.onClick === "function" && textOf(e).includes(text),
  );
  if (!el) throw new Error(`No button showing ${text}`);
  return el;
}
function clickText(tree: ReactNode, text: string, role?: string) {
  button(tree, text, role).props.onClick?.();
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
      expect(names).toContain("Open version 3 to review");
      expect(names).toContain("Mark version 2 as sent");
      expect(names).toContain("Share version 2");
      expect(names).toContain("Withdraw the review of version 2");
      expect(html).not.toContain(SHARED_BUSINESS_NOTE);
    });
  });

  it("offers a reviewer who did not prepare a version Open to review, never a sign-off from the list", async () => {
    const { labels: names, html } = await panel("bea", "reviewer", [version({})]);
    expect(names).toContain("Open version 1 to review");
    expect(html).toContain("Open to review");
    expect(names).not.toContain("Open version 1");
    expect(names).not.toContain("Review version 1 for issuance");
    expect(names).not.toContain("Return version 1 to its preparer");
    expect(names).not.toContain("Ask for review of version 1");
  });

  it("gives the preparer Ask for review and Open to review, where Issue alone waits", async () => {
    const { labels: names, html } = await panel("ada", "preparer", [version({})]);
    expect(names).toContain("Ask for review of version 1");
    expect(names).toContain("Open version 1 to review");
    expect(names).not.toContain("Issue version 1 without an independent review");
    expect(names).not.toContain("Return version 1 to its preparer");
    expect(html).toContain("Ask for review");
  });

  it("offers a preparer who cannot issue alone plain Open", async () => {
    server.listReports.mockResolvedValue({
      versions: [version({})],
      work: { firm: true, role: "preparer" },
      review: { canIssueAlone: false, issueAloneReason: "x", assignedReviewerUserId: null },
    });
    state.userId = "ada";
    server.getFirm.mockResolvedValue({ firm: { role: "preparer" }, members: [] });
    const names = labels(await runtime.settle(() => ReportVersionsPanel()));
    expect(names).toContain("Open version 1");
    expect(names).toContain("Ask for review of version 1");
  });

  it("marks a version a newer one superseded, and prints a review in the assigned reviewer's place", async () => {
    const older = version({
      id: "rv_1",
      versionNo: 1,
      reviewedBy: "own",
      reviewedByName: "Owen Owner",
      reviewedAt: "2026-10-06T09:00:00.000Z",
      reviewOverrideNote: "Bea is on leave this week.",
    });
    const newer = version({ id: "rv_2", versionNo: 2 });
    state.userId = "ada";
    server.listReports.mockResolvedValue({
      versions: [newer, older],
      work: { firm: true, role: "preparer" },
      review: { canIssueAlone: false, issueAloneReason: "x", assignedReviewerUserId: "bea" },
    });
    server.getFirm.mockResolvedValue({
      firm: { role: "preparer" },
      members: [{ userId: "bea", name: "Bea Lin" }],
    });
    const html = renderToStaticMarkup(<>{await runtime.settle(() => ReportVersionsPanel())}</>);
    expect(html).toContain("Superseded by version 2");
    expect(html.match(/Superseded by version/g)).toHaveLength(1);
    expect(html).toContain(
      "Signed by Owen Owner instead of the assigned reviewer Bea Lin: Bea is on leave this week.",
    );
  });

  describe("Withdraw review in the list", () => {
    const reviewed = () =>
      version({
        reviewedBy: "bea",
        reviewedByName: "Bea Lin",
        reviewedAt: "2026-10-06T09:00:00.000Z",
      });

    it("shows to the signer and the firm owner before the version is sent, to no one else", async () => {
      expect((await panel("bea", "reviewer", [reviewed()])).labels).toContain(
        "Withdraw the review of version 1",
      );
      runtime.reset();
      expect((await panel("own", "owner", [reviewed()])).labels).toContain(
        "Withdraw the review of version 1",
      );
      runtime.reset();
      expect((await panel("cy", "reviewer", [reviewed()])).labels).not.toContain(
        "Withdraw the review of version 1",
      );
      runtime.reset();
      expect((await panel("ada", "preparer", [reviewed()])).labels).not.toContain(
        "Withdraw the review of version 1",
      );
      runtime.reset();
      const sent = { ...reviewed(), sentAt: "2026-10-07T09:00:00.000Z" };
      expect((await panel("own", "owner", [sent])).labels).not.toContain(
        "Withdraw the review of version 1",
      );
    });

    it("asks first, saying what withdrawing does, then withdraws", async () => {
      server.withdrawReportReview.mockResolvedValue({ version: version({}) });
      const first = await panel("bea", "reviewer", [reviewed()]);
      click(first.tree, "Withdraw the review of version 1");
      const asking = await runtime.settle(() => ReportVersionsPanel());
      const html = renderToStaticMarkup(<>{asking}</>);
      expect(html).toContain(withdrawConfirmText(1));
      expect(html).not.toContain("You cannot undo this.");
      expect(server.withdrawReportReview).not.toHaveBeenCalled();
      clickText(asking, "Withdraw review", "alertdialog");
      const after = await runtime.settle(() => ReportVersionsPanel());
      expect(server.withdrawReportReview).toHaveBeenCalledWith({ data: { id: "rv_1" } });
      expect(labels(after)).not.toContain("Withdraw the review of version 1");
      expect(labels(after)).toContain("Open version 1 to review");
    });
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
      expect(html).toContain("Returned: Add the payroll duties. by Bea Lin on Oct 7, 2026");
      expect(names.filter((n) => n !== "Open version 1" && n !== "Report versions")).toEqual([]);
    }
  });

  describe("a version waiting for the viewer's review", () => {
    const asked = (patch: Partial<ReportVersionRow> = {}) =>
      version({
        id: "rv_3",
        versionNo: 3,
        reviewRequestedAt: "2026-10-06T09:00:00.000Z",
        reviewRequestedFrom: "bea",
        reviewRequestedFromName: "Bea Lin",
        ...patch,
      });
    /** The "Lock this version" button in the tree. */
    const lockButton = (tree: ReactNode) => button(tree, "Lock this version");

    it("shows a banner at the top linking to that version, and an outline Lock", async () => {
      const { tree, html } = await panel("bea", "reviewer", [asked(), version({})]);
      expect(html).toContain("Version 3 waits for your review.");
      const [banner] = findAll(tree, (e) => e.props.role === "status");
      expect(textOf(banner)).toContain("Version 3 waits for your review.");
      expect(textOf(banner)).toContain("Open version 3");
      expect(html.indexOf("Version 3 waits for your review.")).toBeLessThan(
        html.indexOf("Lock this version"),
      );
      expect((lockButton(tree).props as { variant?: string }).variant).toBe("outline");
    });

    it("shows no banner to the preparer, nor to a reviewer it was not asked of", async () => {
      for (const [viewer, role, patch] of [
        ["ada", "preparer", {}],
        ["own", "owner", {}],
        ["bea", "reviewer", { reviewRequestedAt: null, reviewRequestedFrom: null }],
      ] as const) {
        runtime.reset();
        const { tree, html } = await panel(viewer, role, [asked(patch)]);
        expect(html).not.toContain("waits for your review");
        expect(findAll(tree, (e) => e.props.role === "status")).toEqual([]);
      }
    });

    it("keeps Lock filled for a preparer", async () => {
      const { tree } = await panel("ada", "preparer", [asked()]);
      expect((lockButton(tree).props as { variant?: string }).variant).toBe("default");
    });
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

describe("the open version's review controls", () => {
  type Rules = {
    canIssueAlone: boolean;
    issueAloneReason: string;
    assignedReviewerUserId: string | null;
  };
  const rules = (patch: Partial<Rules> = {}): Rules => ({
    canIssueAlone: false,
    issueAloneReason: "A different person at the firm must review this report for issuance",
    assignedReviewerUserId: null,
    ...patch,
  });

  /** The controls on `open` for `viewer`, over the business's `versions`. */
  async function view(
    viewer: string,
    role: string | null,
    open: ReportVersionRow,
    review: Rules = rules(),
    versions: ReportVersionRow[] = [open],
  ) {
    state.userId = viewer;
    server.listReports.mockResolvedValue({ versions, work: { firm: true, role }, review });
    server.getFirm.mockResolvedValue({
      firm: { role },
      members: [
        { userId: "bea", name: "Bea Lin" },
        { userId: "own", name: "Owen Owner" },
      ],
    });
    const render = () => OpenVersionReview({ version: open });
    const tree = await runtime.settle(render);
    return { tree, render, labels: labels(tree), html: renderToStaticMarkup(<>{tree}</>) };
  }

  it("gives a reviewer who did not prepare it Review for issuance and Return to preparer", async () => {
    const { labels: names } = await view("bea", "reviewer", version({}));
    expect(server.listReports).toHaveBeenCalledWith({ data: { businessId: "biz_1" } });
    expect(names).toContain("Review version 1 for issuance");
    expect(names).toContain("Return version 1 to its preparer");
  });

  it("asks in a dialog naming the version, the preparer and an independent review, then signs", async () => {
    server.signOffReport.mockResolvedValue({
      version: version({ reviewedBy: "bea", reviewedAt: "2026-10-06T09:00:00.000Z" }),
    });
    const first = await view("bea", "reviewer", version({}));
    click(first.tree, "Review version 1 for issuance");
    const asking = await runtime.settle(first.render);
    const html = renderToStaticMarkup(<>{asking}</>);
    expect(labels(asking)).toContain("Review version 1 for issuance?");
    expect(html).toContain("Prepared by Ada Park");
    expect(html).toContain("Independent review");
    expect(html).not.toContain("Not an independent review");
    expect(html).not.toContain("Why you review in place of");
    expect(server.signOffReport).not.toHaveBeenCalled();
    clickText(asking, "Review for issuance", "dialog");
    const after = await runtime.settle(first.render);
    expect(server.signOffReport).toHaveBeenCalledWith({
      data: { id: "rv_1", note: "", issueWithoutIndependentReview: false },
    });
    // Signed: the dialog closes, and the signer may withdraw.
    expect(labels(after)).not.toContain("Review version 1 for issuance?");
    expect(labels(after)).toContain("Withdraw the review of version 1");
  });

  it("asks for the override note when someone else is the assigned reviewer", async () => {
    server.signOffReport.mockResolvedValue({ version: version({}) });
    const first = await view("own", "owner", version({}), rules({ assignedReviewerUserId: "bea" }));
    click(first.tree, "Review version 1 for issuance");
    const asking = await runtime.settle(first.render);
    expect(renderToStaticMarkup(<>{asking}</>)).toContain(
      "Why you review in place of the assigned reviewer Bea Lin (10 to 600 characters)",
    );
    expect(button(asking, "Review for issuance", "dialog").props.disabled).toBe(true);
    const [overrideBox] = findAll(asking, (e) => e.type === "textarea");
    overrideBox.props.onChange?.({ target: { value: "Bea is on leave this week." } });
    const typed = await runtime.settle(first.render);
    expect(button(typed, "Review for issuance", "dialog").props.disabled).toBe(false);
    clickText(typed, "Review for issuance", "dialog");
    await runtime.settle(first.render);
    expect(server.signOffReport).toHaveBeenCalledWith({
      data: {
        id: "rv_1",
        note: "",
        issueWithoutIndependentReview: false,
        overrideNote: "Bea is on leave this week.",
      },
    });
  });

  it("asks no override note of the assigned reviewer, nor on a version the assigned reviewer prepared", async () => {
    for (const [viewer, role, preparedBy] of [
      ["bea", "reviewer", "ada"],
      ["own", "owner", "bea"],
    ] as const) {
      runtime.reset();
      const first = await view(
        viewer,
        role,
        version({ preparedBy }),
        rules({ assignedReviewerUserId: "bea" }),
      );
      click(first.tree, "Review version 1 for issuance");
      const asking = await runtime.settle(first.render);
      expect(renderToStaticMarkup(<>{asking}</>)).not.toContain("Why you review in place of");
      expect(button(asking, "Review for issuance", "dialog").props.disabled).toBe(false);
    }
  });

  it("hides Issue alone when the rules refuse it, and shows why", async () => {
    const { labels: names, html } = await view("ada", "preparer", version({}));
    expect(names).not.toContain("Issue version 1 without an independent review");
    expect(html).toContain("A different person at the firm must review this report for issuance");
  });

  it("offers Issue alone when the rules allow it, saying it is not an independent review", async () => {
    server.signOffReport.mockResolvedValue({ version: version({}) });
    const first = await view("ada", "owner", version({}), rules({ canIssueAlone: true }));
    click(first.tree, "Issue version 1 without an independent review");
    const asking = await runtime.settle(first.render);
    const html = renderToStaticMarkup(<>{asking}</>);
    expect(labels(asking)).toContain("Issue version 1 without an independent review?");
    expect(html).toContain("Not an independent review");
    clickText(asking, "Issue without an independent review", "dialog");
    await runtime.settle(first.render);
    expect(server.signOffReport).toHaveBeenCalledWith({
      data: { id: "rv_1", note: "", issueWithoutIndependentReview: true },
    });
  });

  it("says a newer version supersedes the open one, in the view and in the dialog", async () => {
    const open = version({});
    const first = await view("bea", "reviewer", open, rules(), [
      version({ id: "rv_3", versionNo: 3 }),
      open,
    ]);
    expect(first.html).toContain("Superseded by version 3");
    click(first.tree, "Review version 1 for issuance");
    const asking = await runtime.settle(first.render);
    expect(renderToStaticMarkup(<>{asking}</>)).toContain(
      "Superseded by version 3: a newer version exists.",
    );
  });

  describe("hands the page the version as it reads after each action", () => {
    const signed = () =>
      version({
        reviewedBy: "bea",
        reviewedByName: "Bea Lin",
        reviewedAt: "2026-10-06T09:00:00.000Z",
      });

    /** The controls on `open` for `viewer`, reporting each changed version to `onChange`. */
    async function watched(viewer: string, role: string, open: ReportVersionRow) {
      const onChange = vi.fn();
      state.userId = viewer;
      server.listReports.mockResolvedValue({
        versions: [open],
        work: { firm: true, role },
        review: rules(),
      });
      server.getFirm.mockResolvedValue({ firm: { role }, members: [] });
      const render = () => OpenVersionReview({ version: open, onChange });
      return { onChange, render, tree: await runtime.settle(render) };
    }

    it("after a sign-off", async () => {
      server.signOffReport.mockResolvedValue({ version: signed() });
      const { onChange, render, tree } = await watched("bea", "reviewer", version({}));
      expect(onChange).not.toHaveBeenCalled();
      click(tree, "Review version 1 for issuance");
      clickText(await runtime.settle(render), "Review for issuance", "dialog");
      await runtime.settle(render);
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(signed());
    });

    it("after a withdrawal", async () => {
      server.withdrawReportReview.mockResolvedValue({ version: version({}) });
      const { onChange, render, tree } = await watched("bea", "reviewer", signed());
      click(tree, "Withdraw the review of version 1");
      clickText(await runtime.settle(render), "Withdraw review", "alertdialog");
      await runtime.settle(render);
      expect(onChange).toHaveBeenCalledWith(version({}));
    });

    it("after a return, through a note written on the page", async () => {
      const returned = version({
        returnedAt: "2026-10-07T15:00:00.000Z",
        returnedBy: "bea",
        returnedByName: "Bea Lin",
        returnNote: "Add the payroll duties.",
      });
      const prompt = vi.fn(() => "never asked");
      vi.stubGlobal("window", { prompt });
      const returnReport = vi.mocked(
        (await import("@/lib/precog/firm/review-server")).returnReport,
      );
      try {
        returnReport.mockResolvedValue({ version: returned });
        const { onChange, render, tree } = await watched("bea", "reviewer", version({}));
        click(tree, "Return version 1 to its preparer");
        const writing = await runtime.settle(render);
        expect(prompt).not.toHaveBeenCalled();
        expect(returnReport).not.toHaveBeenCalled();
        const box = () =>
          findAll(
            writing,
            (e) => e.type === "textarea" && (e.props as { required?: boolean }).required === true,
          )[0];
        expect((box()?.props as { maxLength?: number }).maxLength).toBe(600);
        // Nothing to send until the note has words in it.
        const confirm = (tree: ReactNode) =>
          findAll(tree, (e) => e.props["aria-label"] === "Return version 1 with this note")[0];
        expect(confirm(writing)?.props.disabled).toBe(true);
        box()?.props.onChange?.({ target: { value: " Add the payroll duties. " } });
        const ready = await runtime.settle(render);
        expect(confirm(ready)?.props.disabled).toBe(false);
        confirm(ready)?.props.onClick?.();
        const after = await runtime.settle(render);
        expect(prompt).not.toHaveBeenCalled();
        expect(returnReport).toHaveBeenCalledWith({
          data: { id: "rv_1", note: "Add the payroll duties." },
        });
        expect(onChange).toHaveBeenCalledWith(returned);
        expect(renderToStaticMarkup(<>{after}</>)).toContain(
          "Returned: Add the payroll duties. by Bea Lin on Oct 7, 2026",
        );
      } finally {
        returnReport.mockReset();
        vi.unstubAllGlobals();
      }
    });
  });

  it("shows the preparer the returned version's note, who returned it and when", async () => {
    const returned = version({
      reviewRequestedAt: "2026-10-06T09:00:00.000Z",
      returnedAt: "2026-10-07T15:00:00.000Z",
      returnedBy: "bea",
      returnedByName: "Bea Lin",
      returnNote: "Add the payroll duties.",
    });
    for (const [viewer, role] of [
      ["ada", "preparer"],
      ["bea", "reviewer"],
    ]) {
      runtime.reset();
      const { html, labels: names } = await view(viewer, role, returned);
      expect(html).toContain("Returned: Add the payroll duties. by Bea Lin on Oct 7, 2026");
      expect(names).not.toContain("Return version 1 to its preparer");
    }
  });

  it("shows nothing to an account that only reads the versions", async () => {
    state.userId = "bo";
    server.listReports.mockResolvedValue({
      versions: [version({})],
      work: { firm: true, role: null },
      review: rules(),
    });
    server.getFirm.mockResolvedValue({ firm: null, members: [] });
    expect(await runtime.settle(() => OpenVersionReview({ version: version({}) }))).toBeNull();
  });
});
