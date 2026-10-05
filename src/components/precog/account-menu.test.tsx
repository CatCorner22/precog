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
  exportAccountData: vi.fn(),
  exportBusinessHistory: vi.fn(),
  listHistoryDownloads: vi.fn(),
}));
vi.mock("@/lib/auth/client", () => ({ signOut: vi.fn() }));
vi.mock("sonner", () => ({ toast: toasts }));

const { DELETE_ACCOUNT_PROMPT, DigestSwitch, digestSwitchLabel, toggleDigest } =
  await import("./account-menu");

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
