import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// Every way an account save could leave this tab, watched: the read-only
// view of an ended session never calls one.
const server = vi.hoisted(() => ({
  saveBusinessProfile: vi.fn(),
  loadBusinessProfile: vi.fn(),
  listBusinesses: vi.fn(),
}));
vi.mock("./profile-server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./profile-server")>()),
  ...server,
}));

import { defaultProfile, type PracticeProfile } from "./practice-profile";
import {
  PracticeContextPublisher,
  SessionEndedPractice,
  flushEndedSession,
  gateView,
  newAccountGate,
  usePractice,
  usePracticeActions,
  usePracticeState,
  usePracticeSync,
  useSessionEnded,
  type AccountGate,
  type PracticeActions,
  type PracticeState,
  type PracticeSync,
} from "./practice-context";
import type { IdentityLock } from "@/lib/auth/identity-change";
import { resolveTemplate } from "./active-template";

const profile = defaultProfile("general");
const state = {
  profile,
  ready: true,
  template: resolveTemplate(profile),
  mapCustomized: false,
  setupReturnsTo: null,
  businesses: [],
  switchingBusiness: false,
  canUndoMap: false,
  canRedoMap: false,
} satisfies PracticeState;
const actions = {} as PracticeActions;

// React re-renders a component when a context it read changes. Publishing no
// save state at all shows which readers depend on it: a reader of
// usePractice() renders without it, so a save landing never re-renders the
// shell and the tabs; usePracticeSync() needs it.
const render = (children: ReactNode) =>
  renderToStaticMarkup(
    <PracticeContextPublisher
      state={state}
      actions={actions}
      sync={null as unknown as PracticeSync}
    >
      {children}
    </PracticeContextPublisher>,
  );

describe("the practice context parts", () => {
  it("leaves save state out of usePractice(), so a save landing does not re-render its readers", () => {
    let keys: string[] = [];
    function Reader() {
      keys = Object.keys(usePractice());
      return null;
    }
    expect(() => render(<Reader />)).not.toThrow();
    expect(keys).toContain("profile");
    expect(keys).not.toContain("syncStatus");
    expect(keys).not.toContain("saveConflict");
  });

  it("gives save state only to the panels that ask for it", () => {
    function SaveBadge() {
      return <span>{usePracticeSync().syncStatus}</span>;
    }
    expect(() => render(<SaveBadge />)).toThrow("usePracticeSync requires PracticeProvider");
  });
});

// The account gate above the workspace, one session state after another, as
// Better Auth reports them: a guest's refetch sets isPending again (its data
// is null); a signed-in refetch keeps it false.
type Step = {
  accountId?: string | null;
  isPending?: boolean;
  failed?: boolean;
  lock?: IdentityLock | null;
};
const step = (gate: AccountGate, s: Step) =>
  gateView(gate, {
    accountId: s.accountId ?? null,
    isPending: s.isPending ?? false,
    failed: s.failed ?? false,
    lock: s.lock ?? null,
  });
/** The live workspace of `accountId` has rendered `business`. */
function liveWorkspace(gate: AccountGate, accountId: string | null, business: PracticeProfile) {
  const flushLocal = vi.fn(() => true);
  gate.live = { accountId, ready: true, profile: business, flushLocal };
  return flushLocal;
}
const alpha: PracticeProfile = {
  ...defaultProfile("dental"),
  businessId: "biz_alpha",
  practiceName: "Alpha",
};

describe("the account gate", () => {
  it("shows 'Checking your account…' only until the session first resolves (STAB-C-1)", () => {
    const gate = newAccountGate();
    expect(step(gate, { isPending: true }).kind).toBe("placeholder");
    expect(step(gate, {}).kind).toBe("workspace");
    liveWorkspace(gate, null, defaultProfile());
    // Refocus, back online, another tab: each refetches, and for a guest
    // Better Auth sets isPending again. The guest workspace stays mounted
    // under the same key, so an open editor's draft and map undo survive.
    for (let i = 0; i < 3; i++) {
      expect(step(gate, { isPending: true }).kind).toBe("workspace");
      expect(step(gate, {}).kind).toBe("workspace");
    }
  });

  it("keeps a signed-in workspace mounted through its refetches", () => {
    const gate = newAccountGate();
    expect(step(gate, { isPending: true }).kind).toBe("placeholder");
    expect(step(gate, { accountId: "a" }).kind).toBe("workspace");
    expect(step(gate, { accountId: "a" }).kind).toBe("workspace");
  });

  it("shows an ended session's business read-only, and writes its last edits once (STAB-C-7)", () => {
    const gate = newAccountGate();
    step(gate, { accountId: "a" });
    const flushLocal = liveWorkspace(gate, "a", alpha);
    const view = step(gate, { accountId: null });
    expect(view.kind).toBe("ended");
    if (view.kind !== "ended") return;
    expect(view.ended.profile).toBe(alpha);
    flushEndedSession(view.ended);
    flushEndedSession(view.ended);
    expect(flushLocal).toHaveBeenCalledTimes(1);
    // Later requests, pending or failed, keep the same read-only view.
    expect(step(gate, { isPending: true })).toEqual(view);
    expect(step(gate, { failed: true })).toEqual(view);
    // The same account signs in again: its workspace mounts, keyed to it.
    expect(step(gate, { accountId: "a" }).kind).toBe("workspace");
    expect(gate.ended).toBeNull();
  });

  it.each(["signing-out", "other-tab", "changed"] as const)(
    "hides the old business while locked (%s), and never freezes it afterwards",
    (lock) => {
      const gate = newAccountGate();
      step(gate, { accountId: "a" });
      const flushLocal = liveWorkspace(gate, "a", alpha);
      // Another tab signs out: the lock comes first, then the session goes null.
      expect(step(gate, { accountId: "a", lock }).kind).toBe("placeholder");
      expect(step(gate, { accountId: null, lock }).kind).toBe("placeholder");
      // If the lock clears while signed out, the guest workspace opens, as today.
      expect(step(gate, { accountId: null }).kind).toBe("workspace");
      expect(gate.ended).toBeNull();
      expect(flushLocal).not.toHaveBeenCalled();
    },
  );

  it("drops a read-only view the moment a lock arrives", () => {
    const gate = newAccountGate();
    step(gate, { accountId: "a" });
    liveWorkspace(gate, "a", alpha);
    expect(step(gate, {}).kind).toBe("ended");
    expect(step(gate, { lock: "changed" }).kind).toBe("placeholder");
    expect(step(gate, {}).kind).toBe("workspace");
  });

  it("keeps the live workspace when the session request fails", () => {
    const gate = newAccountGate();
    step(gate, { accountId: "a" });
    liveWorkspace(gate, "a", alpha);
    // A network error leaves Better Auth's data, so the account stays.
    expect(step(gate, { accountId: "a", failed: true }).kind).toBe("workspace");
    // A refused request (no data and an error) is not read as a session that ended.
    expect(step(gate, { accountId: null, failed: true }).kind).toBe("workspace");
    expect(gate.ended).toBeNull();
  });

  it("does not freeze a workspace that never finished loading, or another account's", () => {
    const gate = newAccountGate();
    step(gate, { accountId: "a" });
    gate.live = { accountId: "a", ready: false, profile: alpha, flushLocal: () => true };
    expect(step(gate, {}).kind).toBe("workspace");
    step(gate, { accountId: "a" });
    liveWorkspace(gate, "b", alpha);
    expect(step(gate, {}).kind).toBe("workspace");
  });
});

describe("the read-only view of an ended session", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows the business, says the session ended, and saves nothing", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    let seen: { name: string; ended: boolean; status: string } | null = null;
    let readOnly: PracticeActions | null = null;
    function Probe() {
      const { profile } = usePracticeState();
      readOnly = usePracticeActions();
      seen = {
        name: profile.practiceName,
        ended: useSessionEnded(),
        status: usePracticeSync().syncStatus,
      };
      return null;
    }
    renderToStaticMarkup(
      <SessionEndedPractice profile={alpha}>
        <Probe />
      </SessionEndedPractice>,
    );
    expect(seen).toEqual({ name: "Alpha", ended: true, status: "local" });
    const act = readOnly as unknown as PracticeActions;
    act.setPracticeName("Renamed");
    act.removeDecision("d1");
    expect(act.saveProcedure({} as never)).toBe(false);
    expect(await act.switchBusiness("other")).toMatchObject({ ok: false });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(server.saveBusinessProfile).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("is not reported outside an ended session", () => {
    let ended: boolean | null = null;
    function Probe() {
      ended = useSessionEnded();
      return null;
    }
    render(<Probe />);
    expect(ended).toBe(false);
  });
});
