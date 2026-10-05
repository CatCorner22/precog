import type { ComponentType, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHookRuntime, type HookRuntime } from "@/test/hook-runtime";

// The page runs as a plain function under src/test/hook-runtime.ts: state
// persists and effects run as React runs them, so a test sees how often the
// page calls the server. Child components are never rendered.
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
    useMemo: <T,>(make: () => T, deps: unknown[]) =>
      hooks.runtime?.active ? make() : actual.useMemo(make, deps),
  };
});
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options, useSearch: () => ({}) }),
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
  useNavigate: () => vi.fn(),
}));
const state = vi.hoisted(() => ({ userId: "ada" as string | null }));
// A new object on every call, as the real session hook builds one on every render.
vi.mock("@/lib/auth/use-current-user", () => ({
  useCurrentUserState: () => ({
    user: state.userId ? { id: state.userId, displayName: null, isDevFallback: false } : null,
    isPending: false,
  }),
}));
vi.mock("@/lib/precog/practice-context", () => ({
  usePractice: () => ({
    profile: {
      businessId: "biz_1",
      practiceName: "Acme",
      staff: [],
      decisions: [],
      dualRelease: { enabled: false, rules: [] },
    },
    template: {},
    replaceProfile: vi.fn(),
    switchBusiness: vi.fn(),
  }),
}));
vi.mock("@/lib/precog/firm/engagement", () => ({
  advanceEngagement: () => undefined,
  isOwnTeam: () => false,
  pilotMetrics: () => ({
    openFindings: 0,
    acceptedFindings: 0,
    actedOnFindings: 0,
    hoursToMap: null,
    startedAt: null,
    acceptanceRate: null,
    validRate: null,
    reportSent: false,
  }),
  pilotMetricsCsv: () => "",
}));
const server = vi.hoisted(() => ({
  getFirm: vi.fn(),
  listFirmClients: vi.fn(),
  listDeletedClients: vi.fn(),
  recordEngagement: vi.fn(),
  saveFirmProfile: vi.fn(),
  getBillingStatus: vi.fn(),
  getPlanPrices: vi.fn(),
  getEntitlements: vi.fn(),
}));
vi.mock("@/lib/precog/firm/server", () => ({
  getFirm: server.getFirm,
  listFirmClients: server.listFirmClients,
  listDeletedClients: server.listDeletedClients,
  recordEngagement: server.recordEngagement,
  saveFirmProfile: server.saveFirmProfile,
}));
vi.mock("@/lib/precog/billing/server", () => ({
  getBillingStatus: server.getBillingStatus,
  getPlanPrices: server.getPlanPrices,
}));
vi.mock("@/lib/precog/firm/entitlements-server", () => ({
  getEntitlements: server.getEntitlements,
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import { Route } from "./firm";

const Page = (Route as unknown as { options: { component: ComponentType } }).options
  .component as () => unknown;
const runtime = createHookRuntime();
hooks.runtime = runtime;

beforeEach(() => {
  state.userId = "ada";
  server.getFirm.mockResolvedValue({ firm: null, members: [], invites: [], billing: null });
  server.listFirmClients.mockResolvedValue({ clients: [] });
  server.listDeletedClients.mockResolvedValue({ deleted: [] });
  server.getBillingStatus.mockResolvedValue({ account: null, configured: false });
  server.getPlanPrices.mockResolvedValue({ prices: null });
  server.getEntitlements.mockResolvedValue(null);
});

afterEach(() => {
  runtime.reset();
  vi.clearAllMocks();
});

describe("the firm workspace loads the firm", () => {
  it("once per account, though the session hook hands it a new user object on every render", async () => {
    await runtime.settle(Page);
    await runtime.settle(Page);
    expect(server.getFirm).toHaveBeenCalledTimes(1);
    expect(server.listFirmClients).toHaveBeenCalledTimes(1);
    expect(server.getEntitlements).toHaveBeenCalledTimes(1);
  });

  it("again when another account signs in", async () => {
    await runtime.settle(Page);
    state.userId = "bea";
    await runtime.settle(Page);
    expect(server.getFirm).toHaveBeenCalledTimes(2);
  });

  it("not at all when signed out", async () => {
    state.userId = null;
    await runtime.settle(Page);
    expect(server.getFirm).not.toHaveBeenCalled();
  });
});
