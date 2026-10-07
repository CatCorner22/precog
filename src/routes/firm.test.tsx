import { isValidElement, type ComponentType, type ReactElement, type ReactNode } from "react";
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
  useNavigate: () => practice.navigate,
}));
const state = vi.hoisted(() => ({ userId: "ada" as string | null }));
const practice = vi.hoisted(() => ({ navigate: vi.fn(), createBusiness: vi.fn() }));
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
    createBusiness: practice.createBusiness,
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
import { ClientList } from "@/components/precog/firm/client-list";
import { FirmBilling } from "@/components/precog/firm/firm-billing";
import { FirmMembers } from "@/components/precog/firm/firm-members";
import { QuickBooksPanel } from "@/components/precog/firm/quickbooks-panel";
import { toast } from "sonner";

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

/** Every element in the tree, in document order. Child components are not rendered. */
function elements(node: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children)];
}

const ownerFirm = {
  firm: { id: "f1", name: "North Advisors", role: "owner", plan: "assessment" },
  members: [],
  invites: [],
  billing: null,
};

describe("the firm workspace's order", () => {
  it("lists the clients before the firm's settings, which are folded", async () => {
    server.getFirm.mockResolvedValue(ownerFirm);
    const tree = await runtime.settle(Page);
    const all = elements(tree);
    const at = (type: unknown) => all.findIndex((el) => el.type === type);
    expect(at(ClientList)).toBeGreaterThan(-1);
    expect(at(ClientList)).toBeLessThan(at(FirmBilling));
    expect(at(ClientList)).toBeLessThan(at(FirmMembers));
    expect(at(ClientList)).toBeLessThan(at(QuickBooksPanel));
    // Billing, members and QuickBooks sit inside one folded "Firm settings".
    const fold = all.find((el) => el.type === "details");
    expect(fold).toBeDefined();
    expect(fold!.props.open).toBe(false);
    const inside = elements(fold!.props.children);
    for (const type of [FirmBilling, FirmMembers, QuickBooksPanel]) {
      expect(inside.some((el) => el.type === type)).toBe(true);
    }
    const summary = inside.find((el) => el.type === "summary");
    expect(JSON.stringify(summary!.props.children)).toContain("Firm settings");
  });
});

describe("Add client on the firm workspace", () => {
  it("starts the business with its name and line of business, then goes to its setup", async () => {
    practice.createBusiness.mockResolvedValue({ ok: true });
    const tree = await runtime.settle(Page);
    const list = elements(tree).find((el) => el.type === ClientList)!;
    const add = list.props.onAddClient as (name: string, industry: string) => Promise<boolean>;
    await expect(add("Bayside Dental", "dental")).resolves.toBe(true);
    expect(practice.createBusiness).toHaveBeenCalledWith("dental", "Bayside Dental");
    expect(practice.navigate).toHaveBeenCalledWith({ to: "/" });
  });

  it("stays on the page and says why when Precog refuses", async () => {
    practice.createBusiness.mockResolvedValue({ ok: false, reason: "Your plan holds 3 clients." });
    const tree = await runtime.settle(Page);
    const list = elements(tree).find((el) => el.type === ClientList)!;
    const add = list.props.onAddClient as (name: string, industry: string) => Promise<boolean>;
    await expect(add("Bayside Dental", "dental")).resolves.toBe(false);
    expect(practice.navigate).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Precog could not add the client.", {
      description: "Your plan holds 3 clients.",
    });
  });
});

describe("Firm settings while the account loads", () => {
  it("offers no firm name form, so a submit cannot rename the firm or reset its plan", async () => {
    // The firm never arrives: the page stays on its first answer.
    server.getFirm.mockReturnValue(new Promise(() => undefined));
    const tree = await runtime.settle(Page);
    const fold = elements(tree).find((el) => el.type === "details");
    expect(fold).toBeDefined();
    expect(fold!.props.open).toBe(false);
    const inside = elements(fold!.props.children);
    expect(inside.some((el) => el.type === "form")).toBe(false);
    const text = JSON.stringify(fold!.props.children);
    expect(text).toContain("Loading the account…");
    expect(text).not.toContain("Create the firm");
    expect(text).not.toContain("Set up the firm");
  });

  it("offers to create the firm, open, once the account shows there is none", async () => {
    const tree = await runtime.settle(Page);
    const fold = elements(tree).find((el) => el.type === "details")!;
    expect(fold.props.open).toBe(true);
    const inside = elements(fold.props.children);
    expect(inside.some((el) => el.type === "form")).toBe(true);
    expect(JSON.stringify(fold.props.children)).toContain("Create the firm");
  });
});
