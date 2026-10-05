import type { ComponentType, ReactElement, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHookRuntime, type HookRuntime } from "@/test/hook-runtime";

// The invitation pages open straight from an email, outside the business
// workspace that records which account the tab shows. Every signed-in call
// carries that account (authMiddleware) and is refused 409 "The signed-in
// account changed" without it, so each page records it before its first
// signed-in call. The pages run as plain functions under
// src/test/hook-runtime.ts; a child component is run by finding its element
// in the parent's tree.
const hooks = vi.hoisted(() => ({ runtime: null as HookRuntime | null }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const effect = (run: () => void, deps?: unknown[]) =>
    hooks.runtime?.active ? hooks.runtime.useEffect(run, deps) : actual.useEffect(run, deps);
  return {
    ...actual,
    useState: (init: unknown) =>
      hooks.runtime?.active ? hooks.runtime.useState(init) : actual.useState(init),
    useEffect: effect,
    // A layout effect runs before every passive effect of the same commit;
    // here, in declaration order with the rest.
    useLayoutEffect: effect,
  };
});
const params = vi.hoisted(() => ({ token: "ab".repeat(24) }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options, useParams: () => params }),
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
  useNavigate: () => vi.fn(),
}));
const session = vi.hoisted(() => ({ userId: "ada" as string | null }));
vi.mock("@/lib/auth/use-current-user", () => ({
  useCurrentUserState: () => ({
    user: session.userId
      ? {
          id: session.userId,
          displayName: "Ada",
          primaryEmail: "ada@example.test",
          profileImageUrl: null,
          isDevFallback: false,
        }
      : null,
    isPending: false,
  }),
}));
const identity = vi.hoisted(() => ({ set: vi.fn() }));
vi.mock("@/lib/auth/identity-change", () => ({ setDisplayedAccount: identity.set }));
const calls = vi.hoisted(() => ({
  peekFirmInvite: vi.fn(),
  checkFirmInvite: vi.fn(),
  acceptFirmInvite: vi.fn(),
  peekClientGrant: vi.fn(),
  acceptClientGrant: vi.fn(),
}));
vi.mock("@/lib/precog/firm/server", () => ({
  peekFirmInvite: calls.peekFirmInvite,
  checkFirmInvite: calls.checkFirmInvite,
  acceptFirmInvite: calls.acceptFirmInvite,
}));
vi.mock("@/lib/precog/firm/grant-server", () => ({
  peekClientGrant: calls.peekClientGrant,
  acceptClientGrant: calls.acceptClientGrant,
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const firmJoin = await import("./join.$token");
const clientJoin = await import("./join/client/$token");

type Routed = { options: { component: ComponentType } };
const pageOf = (route: unknown) => (route as Routed).options.component as () => ReactElement;

/** The first element in a rendered tree that `match` accepts. */
function find(node: unknown, match: (el: ReactElement) => boolean): ReactElement | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = find(child, match);
      if (hit) return hit;
    }
    return null;
  }
  if (!node || typeof node !== "object" || !("props" in node)) return null;
  const el = node as ReactElement<{ children?: unknown }>;
  if (match(el)) return el;
  return find(el.props.children, match);
}

/** The order a mock was first called in, across every mock. */
const firstCall = (fn: ReturnType<typeof vi.fn>) => fn.mock.invocationCallOrder[0] ?? Infinity;

const page = createHookRuntime();
const child = createHookRuntime();

beforeEach(() => {
  session.userId = "ada";
  hooks.runtime = page;
  calls.peekFirmInvite.mockResolvedValue({
    invite: { firmName: "North", role: "preparer", email: "a***@example.test" },
  });
  calls.checkFirmInvite.mockResolvedValue({
    fit: { fit: "match", accountEmail: "ada@example.test" },
  });
  calls.peekClientGrant.mockResolvedValue({
    grant: {
      businessName: "Ortiz Dental",
      ownerName: "Rosa Ortiz",
      invitedEmailMasked: "a***@example.test",
      status: "open",
    },
  });
  calls.acceptClientGrant.mockResolvedValue({ businessName: "Ortiz Dental", businessId: "b" });
});

afterEach(() => {
  page.reset();
  child.reset();
  vi.clearAllMocks();
});

describe("the firm invitation page", () => {
  it("records the signed-in account before checking how it fits the invitation", async () => {
    const tree = await page.settle(pageOf(firmJoin.Route));
    const joinAs = find(tree, (el) => typeof el.type === "function" && el.type.name === "JoinAs");
    expect(joinAs).not.toBeNull();
    hooks.runtime = child;
    const JoinAs = joinAs?.type as (props: unknown) => ReactElement;
    await child.settle(() => JoinAs(joinAs?.props));
    expect(calls.checkFirmInvite).toHaveBeenCalledTimes(1);
    expect(identity.set).toHaveBeenCalledWith("ada");
    expect(firstCall(identity.set)).toBeLessThan(firstCall(calls.checkFirmInvite));
  });

  it("records nothing for a signed-out visitor, who makes no signed-in call", async () => {
    session.userId = null;
    await page.settle(pageOf(firmJoin.Route));
    expect(identity.set).not.toHaveBeenCalled();
    expect(calls.checkFirmInvite).not.toHaveBeenCalled();
  });
});

describe("the client invitation page", () => {
  it("records the signed-in account before the firm owner accepts", async () => {
    const tree = await page.settle(pageOf(clientJoin.Route));
    const add = find(
      tree,
      (el) =>
        typeof (el.props as { onClick?: unknown }).onClick === "function" &&
        (el.props as { children?: unknown }).children === "Add to our clients",
    );
    expect(add).not.toBeNull();
    (add?.props as { onClick: () => void }).onClick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls.acceptClientGrant).toHaveBeenCalledTimes(1);
    expect(identity.set).toHaveBeenCalledWith("ada");
    expect(firstCall(identity.set)).toBeLessThan(firstCall(calls.acceptClientGrant));
  });
});
