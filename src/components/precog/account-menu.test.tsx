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

describe("the account deletion prompt", () => {
  it("says Stripe keeps its invoices and tax records, and that it cannot be undone", () => {
    expect(DELETE_ACCOUNT_PROMPT).toContain(
      "the billing record (Stripe keeps its invoices and tax records) and the QuickBooks link.",
    );
    expect(DELETE_ACCOUNT_PROMPT).toContain("You cannot undo this.");
    expect(DELETE_ACCOUNT_PROMPT).toContain("Type DELETE to confirm.");
  });
});
