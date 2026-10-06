import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const server = vi.hoisted(() => ({
  update: vi.fn(async (input: { data: { weeklyDigest: boolean; ownerReminders: boolean } }) => ({
    settings: input.data,
  })),
  fail: false,
}));
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const exportPages = vi.hoisted(() => ({
  fetch: vi.fn(async (_input: { data: unknown }): Promise<unknown> => null),
}));
const downloads = vi.hoisted(() => ({ downloadText: vi.fn() }));
vi.mock("@/lib/download", () => downloads);

vi.mock("@/lib/precog/firm/server", () => ({
  getNotificationSettings: vi.fn(async () => ({
    settings: { weeklyDigest: true, ownerReminders: true },
    mailConfigured: true,
    controlsOwnerReminders: true,
  })),
  updateNotificationSettings: (input: {
    data: { weeklyDigest: boolean; ownerReminders: boolean };
  }) => {
    if (server.fail) throw new Error("down");
    return server.update(input);
  },
}));
vi.mock("@/lib/precog/account-server", () => ({
  deleteAccount: vi.fn(),
  exportAccountDataPage: exportPages.fetch,
  exportBusinessHistory: vi.fn(),
  listHistoryDownloads: vi.fn(),
  SIGN_IN_AGAIN_TO_DELETE: "For your safety, sign in again, then delete your account.",
}));
const auth = vi.hoisted(() => ({ signOut: vi.fn(async (_to?: string) => {}) }));
vi.mock("@/lib/auth/client", () => auth);
vi.mock("sonner", () => ({ toast: toasts }));

const {
  DELETE_ACCOUNT_PROMPT,
  DigestSwitch,
  digestSwitchLabel,
  downloadAccountExport,
  toggleDigest,
} = await import("./account-menu");
const { exportProgressLabel } = await import("@/lib/precog/account-export");

describe("Export data", () => {
  const encode = (page: unknown) => Buffer.from(JSON.stringify(page), "utf8").toString("base64");
  const account = {
    exportedAt: "2026-10-06T12:00:00.000Z",
    user: {
      id: "ua",
      name: "Ann",
      email: "ann@example.test",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    firmGrants: [],
    deletedBusinesses: [],
    firmMemberships: [],
    engagements: [],
    reminderSettings: null,
    billing: null,
    quickBooksConnections: [],
    activity: [],
    modelUsage: [],
  };
  const business = (id: string) => ({ id, name: "Café ✓", profile: { note: '"<x>"' } });

  it("fetches the parts in order, shows how far it got, and saves one file", async () => {
    const parts = [
      { section: "firm" },
      { section: "businesses", first: "k2", last: "k2" },
      { section: "businesses", first: "k1", last: "k1" },
    ];
    exportPages.fetch.mockImplementation(async ({ data }: { data: unknown }) => {
      const part = data as { section: string; first?: string };
      if (part.section === "account") {
        return { base64: encode({ section: "account", data: account }), parts };
      }
      if (part.section === "firm") {
        const firm = { firm: null, firmMembers: [], firmInvites: [], firmClients: [] };
        return { base64: encode({ section: "firm", data: firm }), parts: null };
      }
      const rows = [business(part.first === "k2" ? "biz_2" : "biz_1")];
      return { base64: encode({ section: "businesses", rows }), parts: null };
    });
    const progress: string[] = [];
    await downloadAccountExport((done, total) => progress.push(exportProgressLabel(done, total)));
    expect(exportPages.fetch.mock.calls.map(([input]) => input.data)).toEqual([
      { section: "account" },
      ...parts,
    ]);
    expect(progress).toEqual([
      "Preparing your download: 1 of 4 parts",
      "Preparing your download: 2 of 4 parts",
      "Preparing your download: 3 of 4 parts",
      "Preparing your download: 4 of 4 parts",
    ]);
    expect(downloads.downloadText).toHaveBeenCalledTimes(1);
    const [name, text, type] = downloads.downloadText.mock.calls[0];
    expect(name).toMatch(/^precog-account-\d{4}-\d{2}-\d{2}\.json$/);
    expect(type).toBe("application/json");
    const file = JSON.parse(text as string);
    expect(file.user).toEqual(account.user);
    expect(file.businesses).toEqual([business("biz_2"), business("biz_1")]);
    expect(file.reportLogos).toEqual([]);
  });
});

function render(state: { weeklyDigest: boolean; mailConfigured: boolean } | null) {
  return renderToStaticMarkup(
    <DigestSwitch
      state={
        state && {
          settings: { weeklyDigest: state.weeklyDigest, ownerReminders: true },
          mailConfigured: state.mailConfigured,
        }
      }
      disabled={false}
      onToggle={() => {}}
    />,
  );
}

describe("the weekly digest switch in the header", () => {
  beforeEach(() => {
    server.update.mockClear();
    server.fail = false;
    toasts.error.mockClear();
  });

  it("says whether the digest is on, as a switch", () => {
    expect(digestSwitchLabel(true)).toBe("Weekly digest: on");
    expect(digestSwitchLabel(false)).toBe("Weekly digest: off");
    const on = render({ weeklyDigest: true, mailConfigured: true });
    expect(on).toContain("Weekly digest: on");
    expect(on).toContain('role="switch"');
    expect(on).toContain('aria-checked="true"');
    expect(on).toContain('title="Once a week, Precog emails what is due on your businesses"');
    const off = render({ weeklyDigest: false, mailConfigured: true });
    expect(off).toContain("Weekly digest: off");
    expect(off).toContain('aria-checked="false"');
  });

  it("is hidden while the settings load and when this deployment cannot send email", () => {
    expect(render(null)).toBe("");
    expect(render({ weeklyDigest: true, mailConfigured: false })).toBe("");
  });

  it("flips the digest alone and saves both switches", async () => {
    const saved = await toggleDigest({ weeklyDigest: false, ownerReminders: false });
    expect(saved).toEqual({ weeklyDigest: true, ownerReminders: false });
    expect(server.update).toHaveBeenCalledWith({
      data: { weeklyDigest: true, ownerReminders: false },
    });
    expect(await toggleDigest({ weeklyDigest: true, ownerReminders: true })).toEqual({
      weeklyDigest: false,
      ownerReminders: true,
    });
  });

  it("keeps the old setting and says so when the save fails", async () => {
    server.fail = true;
    expect(await toggleDigest({ weeklyDigest: true, ownerReminders: true })).toBeNull();
    expect(toasts.error).toHaveBeenCalledWith("Precog did not save the reminder settings.");
  });
});

describe("the note when the digest cannot reach the account", () => {
  const X_NOTE =
    "Precog cannot email the address your X sign-in carries, so the weekly digest cannot reach you. Sign in with Google or an email-and-password account to receive it.";
  const UNCONFIRMED_NOTE =
    "Precog cannot confirm the address on this account, so the weekly digest cannot reach you. Sign in with a Google account whose address Google has confirmed, or with an email-and-password account.";

  function withProblem(
    weeklyDigest: boolean,
    digestAddressProblem: "x_only" | "unconfirmed" | null,
  ): string {
    return renderToStaticMarkup(
      <DigestSwitch
        state={{
          settings: { weeklyDigest, ownerReminders: true },
          mailConfigured: true,
          digestAddressProblem,
        }}
        disabled={false}
        onToggle={() => {}}
      />,
    );
  }

  it("says why, keyed on the reason, while the digest is on", async () => {
    const { digestAddressNote } = await import("./account-menu");
    expect(digestAddressNote("x_only")).toBe(X_NOTE);
    expect(digestAddressNote("unconfirmed")).toBe(UNCONFIRMED_NOTE);
    expect(digestAddressNote(null)).toBeNull();
    expect(withProblem(true, "x_only")).toContain(X_NOTE);
    expect(withProblem(true, "unconfirmed")).toContain(UNCONFIRMED_NOTE);
  });

  it("prints nothing when the address is fine, or while the digest is off", () => {
    expect(withProblem(true, null)).not.toContain("cannot reach you");
    expect(withProblem(false, "x_only")).not.toContain("cannot reach you");
    expect(withProblem(true, null)).toContain("Weekly digest: on");
  });
});

describe("the local recovery entry", () => {
  it("offers Local recovery beside the other account controls, opening a dialog", async () => {
    const { RECOVERY_ENTRY } = await import("./account-menu");
    expect(RECOVERY_ENTRY.label).toBe("Local recovery");
    expect(RECOVERY_ENTRY.title).toContain("guest businesses");
    const source = readFileSync(new URL("./account-menu.tsx", import.meta.url), "utf8");
    expect(source).toContain("LocalRecoveryControl");
    expect(source).toContain("WorkspaceRecoveryDialog");
  });
});

describe("the sessions entry", () => {
  it("offers Sessions beside the other account controls, opening a dialog", async () => {
    const { SessionsControl, SESSIONS_ENTRY } = await import("./account-menu");
    const html = renderToStaticMarkup(<SessionsControl disabled={false} />);
    expect(SESSIONS_ENTRY.label).toBe("Sessions");
    expect(html).toContain(">Sessions</button>");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain(
      'title="See where this account is signed in, and sign out other sessions"',
    );
    // The dialog loads only when the entry is used.
    expect(html).not.toContain("Signed-in sessions");
  });
});

describe("the account deletion prompt", () => {
  it("says Stripe keeps its invoices and tax records, and that it cannot be undone", () => {
    expect(DELETE_ACCOUNT_PROMPT).toContain(
      "the billing record (Stripe keeps its invoices and tax records) and the QuickBooks link.",
    );
    expect(DELETE_ACCOUNT_PROMPT).toContain("You cannot undo this.");
    expect(DELETE_ACCOUNT_PROMPT).toContain("Type DELETE to confirm.");
  });
});

describe("a refused account deletion", () => {
  const SIGN_IN_AGAIN = "For your safety, sign in again, then delete your account.";
  const refusal = (status: number, message: string) =>
    Object.assign(new Error(message), { status, name: "RequestError" });

  beforeEach(() => {
    toasts.error.mockClear();
    auth.signOut.mockClear();
  });

  it("on a 403, shows the message with a Sign in again button that signs out to /login", async () => {
    const { showDeletionFailure, SIGN_IN_AGAIN_LABEL } = await import("./account-menu");
    showDeletionFailure(refusal(403, SIGN_IN_AGAIN));
    expect(SIGN_IN_AGAIN_LABEL).toBe("Sign in again");
    const [message, options] = toasts.error.mock.calls[0] as [
      string,
      { action: { label: string; onClick: () => void } },
    ];
    expect(message).toBe(SIGN_IN_AGAIN);
    expect(options.action.label).toBe("Sign in again");
    options.action.onClick();
    expect(auth.signOut).toHaveBeenCalledWith("/login");
  });

  it("shows a 409's reason, and the reload advice for anything else, with no button", async () => {
    const { showDeletionFailure } = await import("./account-menu");
    const reload =
      "Precog could not finish the deletion or the sign-out. Reload to check the account. If the deletion finished, you cannot undo this.";
    showDeletionFailure(refusal(409, "Cancel the firm plan first."));
    showDeletionFailure(new Error("network"));
    // A 403 for another reason (a cross-site refusal) offers no sign-in.
    showDeletionFailure(refusal(403, "Forbidden"));
    expect(toasts.error.mock.calls).toEqual([["Cancel the firm plan first."], [reload], [reload]]);
  });
});
