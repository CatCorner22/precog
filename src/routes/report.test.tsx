import type { ComponentType, ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHookRuntime, type HookRuntime } from "@/test/hook-runtime";

// The live report runs as a plain function under src/test/hook-runtime.ts:
// state persists and effects run as React runs them, so a test reads the
// props the page hands ControlReport once its server answers have landed.
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
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options, useSearch: () => ({}) }),
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/components/precog/control-report", () => ({ ControlReport: () => null }));
vi.mock("@/lib/auth/use-current-user", () => ({ useCurrentUser: () => ({ id: "viewer" }) }));
vi.mock("@/lib/precog/practice-context", () => ({
  usePractice: () => ({
    profile: { businessId: "biz_1" },
    businesses: [{ id: "biz_1", firmClient: true }],
  }),
}));
const server = vi.hoisted(() => ({ getFirm: vi.fn(), getReport: vi.fn(), listReports: vi.fn() }));
vi.mock("@/lib/precog/firm/server", () => server);

import { Route } from "./report";

const Page = (Route as unknown as { options: { component: ComponentType } }).options
  .component as () => ReactElement;
const runtime = createHookRuntime();
hooks.runtime = runtime;

const ownFirm = {
  firm: { name: "Owner's Own Firm", letterhead: "1 Elm St", logoDataUrl: null, coverPage: true },
};

/** The live report's ControlReport props, after its server answers land. */
async function liveProps() {
  const live = Page().type as () => ReactElement;
  const tree = await runtime.settle(live);
  return tree.props as { firm: unknown; coverPage: boolean; sharedOwner: boolean };
}

beforeEach(() => {
  server.getFirm.mockResolvedValue(ownFirm);
});
afterEach(() => {
  runtime.reset();
  vi.clearAllMocks();
});

describe("the live report names a firm", () => {
  it("not for the business's own account on a business it shared with another firm, even one it runs", async () => {
    server.listReports.mockResolvedValue({ versions: [], work: { firm: true, role: null } });
    expect(await liveProps()).toMatchObject({ firm: null, coverPage: false, sharedOwner: true });
  });

  it("for a member of the business's firm, with its letterhead and the sent stamp", async () => {
    server.listReports.mockResolvedValue({ versions: [], work: { firm: true, role: "preparer" } });
    expect(await liveProps()).toMatchObject({
      firm: { name: "Owner's Own Firm", letterhead: "1 Elm St", logoDataUrl: null },
      coverPage: true,
      sharedOwner: false,
    });
  });
});
