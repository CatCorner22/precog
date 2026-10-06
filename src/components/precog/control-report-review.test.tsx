import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { versionProvenance, type ReportVersionRow } from "@/lib/precog/firm/reports";
import { createHookRuntime, type HookRuntime } from "@/test/hook-runtime";

// The report runs as a plain function under src/test/hook-runtime.ts, so a
// test can hand its review controls a changed version, as a sign-off, a
// return or a withdrawal does, and read what the cover and header print next.
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
    useMemo: <T,>(compute: () => T, deps: unknown[]) =>
      hooks.runtime?.active ? compute() : actual.useMemo(compute, deps),
  };
});
vi.mock("@/lib/precog/practice-context", async () => {
  const { defaultProfile } = await import("@/lib/precog/practice-profile");
  const { resolveTemplate } = await import("@/lib/precog/active-template");
  const profile = defaultProfile("dental");
  const tpl = resolveTemplate(profile);
  return {
    usePractice: () => ({ profile, mapCustomized: false }),
    useTemplate: () => tpl,
  };
});
vi.mock("@/components/precog/report-versions", () => ({
  OpenVersionReview: function OpenVersionReview() {
    return null;
  },
  ReportVersionsPanel: function ReportVersionsPanel() {
    return null;
  },
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));

const { ControlReport } = await import("./control-report");
const { OpenVersionReview } = await import("@/components/precog/report-versions");

const runtime = createHookRuntime();
hooks.runtime = runtime;
beforeEach(() => runtime.reset());
afterEach(() => runtime.reset());

const reviewed: ReportVersionRow = {
  id: "rv_1",
  businessId: "biz_1",
  versionNo: 1,
  revision: 1,
  scopeNote: "",
  preparedBy: "ada",
  preparedByName: "Ada Park",
  preparedAt: "2026-10-05T12:00:00.000Z",
  reviewedBy: "bea",
  reviewedByName: "Bea Lin",
  reviewedAt: "2026-10-06T09:00:00.000Z",
  reviewNote: "",
  reviewOverrideNote: null,
  sentAt: null,
  hasFigures: false,
  firm: null,
  engagement: null,
  reviewRequestedAt: "2026-10-05T13:00:00.000Z",
  reviewRequestedFrom: null,
  reviewRequestedFromName: null,
  returnedAt: null,
  returnedBy: null,
  returnedByName: null,
  returnNote: "",
};
const withdrawn: ReportVersionRow = {
  ...reviewed,
  reviewedBy: null,
  reviewedByName: null,
  reviewedAt: null,
};
const north = { name: "North Advisors", letterhead: "", logoDataUrl: null };

type Props = { children?: ReactNode; "aria-label"?: string };

/** Every element in the tree that `match` accepts, in document order. */
function findAll(
  node: ReactNode,
  match: (el: ReactElement<Props>) => boolean,
): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap((n) => findAll(n, match));
  if (!isValidElement<Props>(node)) return [];
  return [...(match(node) ? [node] : []), ...findAll(node.props.children, match)];
}

/** The text an element holds, from its string children. */
function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  return isValidElement<Props>(node) ? textOf(node.props.children) : "";
}

/** What the cover page and the header print, and the review controls' element. */
function page(tree: ReactNode) {
  const [cover] = findAll(tree, (el) => el.props["aria-label"] === "Cover page");
  const [header] = findAll(tree, (el) => el.type === "header");
  const [review] = findAll(tree, (el) => el.type === OpenVersionReview);
  return {
    cover: textOf(cover),
    header: textOf(header),
    review: review as ReactElement<{
      version: ReportVersionRow;
      onChange?: (v: ReportVersionRow) => void;
    }>,
  };
}

describe("the open version's provenance", () => {
  const render = () => ControlReport({ locked: reviewed, firm: north, coverPage: true });

  it("follows a withdrawal on the cover and in the header, without a reload", async () => {
    const before = page(await runtime.settle(render));
    expect(before.cover).toContain(versionProvenance(reviewed));
    expect(before.header).toContain(versionProvenance(reviewed));
    expect(before.cover).toContain("Reviewed for issuance by Bea Lin");

    // The review controls withdraw the review and hand back the version.
    expect(typeof before.review.props.onChange).toBe("function");
    before.review.props.onChange?.(withdrawn);
    const after = page(await runtime.settle(render));
    for (const printed of [after.cover, after.header]) {
      expect(printed).toContain(versionProvenance(withdrawn));
      expect(printed).not.toContain("Reviewed for issuance");
    }
    // The controls read the same version the page prints.
    expect(after.review.props.version).toBe(withdrawn);
  });

  it("follows a sign-off, and ignores a version other than the one open", async () => {
    const open = { ...withdrawn };
    const view = () => ControlReport({ locked: open, firm: north, coverPage: true });
    const before = page(await runtime.settle(view));
    expect(before.header).toContain("Review requested from the firm's reviewers");
    before.review.props.onChange?.({ ...reviewed, id: "rv_other" });
    expect(page(await runtime.settle(view)).header).not.toContain("Reviewed for issuance");
    before.review.props.onChange?.(reviewed);
    const after = page(await runtime.settle(view));
    expect(after.header).toContain("Reviewed for issuance by Bea Lin on");
    expect(after.cover).toContain("Reviewed for issuance by Bea Lin on");
  });
});
