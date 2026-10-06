import { describe, expect, it, vi } from "vitest";

// useMemo outside a renderer: one cache slot, recomputed when a dependency
// changes under Object.is, as React compares them.
const memo = vi.hoisted(() => ({ deps: null as unknown[] | null, value: undefined as unknown }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useMemo: (make: () => unknown, deps: unknown[]) => {
    if (!memo.deps || deps.some((d, i) => !Object.is(d, memo.deps![i]))) {
      memo.deps = deps;
      memo.value = make();
    }
    return memo.value;
  },
}));
const session = vi.hoisted(() => ({
  user: null as Record<string, string> | null,
  isPending: false,
  isRefetching: false,
  error: null as unknown,
}));
vi.mock("./client", () => ({
  authEnabled: true,
  // A new `data` object on every call, as a session refetch hands back.
  authClient: {
    useSession: () => ({
      data: session.user ? { user: { ...session.user } } : null,
      isPending: session.isPending,
      isRefetching: session.isRefetching,
      error: session.error,
    }),
  },
}));

import { useCurrentUserState } from "./use-current-user";

describe("the signed-in user", () => {
  it("is the same object from render to render while its fields stay the same", () => {
    session.user = { id: "u1", name: "Ada", email: "ada@example.test", image: "" };
    const first = useCurrentUserState().user;
    const second = useCurrentUserState().user;
    expect(second).toBe(first);
    expect(first).toMatchObject({ id: "u1", displayName: "Ada", primaryEmail: "ada@example.test" });
  });

  it("is a new object when a field changes, and null when signed out", () => {
    session.user = { id: "u1", name: "Ada", email: "ada@example.test", image: "" };
    const before = useCurrentUserState().user;
    session.user = { ...session.user, name: "Ada Park" };
    const after = useCurrentUserState().user;
    expect(after).not.toBe(before);
    expect(after?.displayName).toBe("Ada Park");
    session.user = null;
    expect(useCurrentUserState().user).toBeNull();
  });
});

describe("the session request state", () => {
  it("tells a background refetch apart from the first load", () => {
    // A guest's refetch: Better Auth sets isPending again because data is null.
    session.user = null;
    session.isPending = true;
    session.isRefetching = true;
    expect(useCurrentUserState()).toMatchObject({
      user: null,
      isPending: true,
      isRefetching: true,
    });
    session.isPending = false;
    session.isRefetching = false;
    expect(useCurrentUserState()).toMatchObject({ isPending: false, isRefetching: false });
  });

  it("passes the request's error through, and null when it succeeded", () => {
    const failure = new TypeError("Failed to fetch");
    session.error = failure;
    expect(useCurrentUserState().error).toBe(failure);
    session.error = undefined;
    expect(useCurrentUserState().error).toBeNull();
  });
});
