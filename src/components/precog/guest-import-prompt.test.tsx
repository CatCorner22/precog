import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { importableGuestBusinesses } from "@/lib/precog/guest-import";
import { readLocal } from "@/lib/precog/local-data";
import { loadPortfolio, normalizeProfile, savePortfolioEntry } from "@/lib/precog/practice-profile";
import { ScopedStorage } from "@/lib/precog/workspace-storage";

const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toasts }));
vi.mock("@/lib/precog/firm/server", () => ({ getFirm: vi.fn(async () => ({ firm: null })) }));
vi.mock("@/lib/precog/practice-context", () => ({
  usePracticeActions: () => ({ switchBusiness: async () => ({ ok: true }) }),
  usePracticeSync: () => ({ saveConflict: null }),
}));
vi.mock("@/lib/precog/workspace-context", () => ({
  useWorkspace: () => ({ accountId: "A", local: null, session: null }),
}));

const {
  BehindGuestImportPrompt,
  GuestImportDialog,
  GuestImportPrompt,
  GUEST_IMPORT_FIRM_NOTE,
  GUEST_IMPORT_NOT_NOW,
  GUEST_IMPORT_NOT_SAVED,
  GUEST_IMPORT_SAVE,
  declineGuestWork,
  guestImportBody,
  guestImportNotSavedToast,
  guestImportSavedToast,
  guestImportTitle,
  saveGuestWork,
} = await import("./guest-import-prompt");

/**
 * One browser's localStorage; guest and the account are ScopedStorage views
 * over it. `quota` is a byte ceiling: a write past it is refused, as a full
 * browser refuses one.
 */
class MemoryStorage {
  data = new Map<string, string>();
  constructor(private readonly quota = Infinity) {}
  private get bytes() {
    let total = 0;
    for (const [key, value] of this.data) total += key.length + value.length;
    return total;
  }
  get length() {
    return this.data.size;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    const current = this.data.get(key) ?? "";
    if (this.bytes - current.length + value.length > this.quota)
      throw new Error("QuotaExceededError");
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

function browser(quota?: number) {
  const raw = new MemoryStorage(quota);
  return {
    raw,
    guest: new ScopedStorage(raw, null),
    account: new ScopedStorage(raw, "A"),
  };
}

function business(id: string, name: string) {
  return normalizeProfile({ businessId: id, practiceName: name, industry: "dental" });
}

function render(names: string[], inFirm = false) {
  const html = renderToStaticMarkup(
    <GuestImportDialog names={names} inFirm={inFirm} onSave={() => {}} onDecline={() => {}} />,
  );
  return {
    html,
    text: html
      .replace(/<[^>]+>/g, " ")
      .replace(/&#x27;/g, "'")
      .replace(/\s+/g, " "),
  };
}

describe("the guest-work question after sign-in", () => {
  beforeEach(() => {
    toasts.success.mockClear();
    toasts.error.mockClear();
  });

  it("asks about the one business by name, with Save and Not now", () => {
    const { html, text } = render(["Riverside Dental"]);
    expect(guestImportTitle(["Riverside Dental"])).toBe("Save Riverside Dental to your account?");
    expect(guestImportBody(["Riverside Dental"])).toBe(
      "This browser holds Riverside Dental from before you signed in. Precog copies it into your account and keeps the original on this device.",
    );
    expect(text).toContain("Save Riverside Dental to your account?");
    expect(text).toContain(guestImportBody(["Riverside Dental"]));
    expect(GUEST_IMPORT_SAVE).toBe("Save to my account");
    expect(GUEST_IMPORT_NOT_NOW).toBe("Not now");
    expect(html).toContain(`>${GUEST_IMPORT_SAVE}</button>`);
    expect(html).toContain(`>${GUEST_IMPORT_NOT_NOW}</button>`);
    expect(html).toContain('role="dialog" aria-modal="true" aria-labelledby="guest-import-title"');
    expect(html).toContain('id="guest-import-title"');
    expect(text).not.toContain(GUEST_IMPORT_FIRM_NOTE);
    expect(html).not.toContain("<li>");
  });

  it("counts several businesses and lists their names", () => {
    const names = ["Riverside Dental", "Hillcrest Vet", "Oak Street Books"];
    const { html, text } = render(names);
    expect(guestImportTitle(names)).toBe("Save 3 businesses to your account?");
    expect(guestImportBody(names)).toBe(
      "This browser holds 3 businesses from before you signed in. Precog copies them into your account and keeps the originals on this device.",
    );
    expect(text).toContain("Save 3 businesses to your account?");
    for (const name of names) expect(html).toContain(`<li>${name}</li>`);
  });

  it("says the business joins the firm's client list only for a firm member", () => {
    expect(GUEST_IMPORT_FIRM_NOTE).toBe("This business joins your firm's client list.");
    expect(render(["Riverside Dental"], true).text).toContain(
      `Precog copies it into your account and keeps the original on this device. ${GUEST_IMPORT_FIRM_NOTE}`,
    );
    expect(render(["Riverside Dental"], false).text).not.toContain("client list");
  });

  it("copies the guest work on Save, opens the copy and says so", async () => {
    const { guest, account } = browser();
    savePortfolioEntry(business("biz_1", "Riverside Dental"), guest);
    const switchBusiness = vi.fn(async () => ({ ok: true as const }));

    await saveGuestWork(guest, account, switchBusiness);

    const [copy] = Object.values(loadPortfolio(account));
    expect(copy.practiceName).toBe("Riverside Dental");
    expect(switchBusiness).toHaveBeenCalledWith(copy.businessId);
    expect(toasts.success).toHaveBeenCalledWith(
      "Riverside Dental is in your account. It syncs from here on.",
    );
    expect(importableGuestBusinesses(guest, account)).toEqual([]);
    expect(loadPortfolio(guest).biz_1?.practiceName).toBe("Riverside Dental");
  });

  it("names the count and the open one when several are saved", () => {
    expect(guestImportSavedToast(["Riverside Dental", "Hillcrest Vet"])).toBe(
      "Copied 2 businesses. Riverside Dental is open.",
    );
  });

  it("names only the copies that stored, and the one that did not, when the browser fills up", async () => {
    // Room for the guest work and one copy, not two: the second copy's write
    // is refused, the first stays in the account and is the one opened.
    const { raw, guest } = browser();
    savePortfolioEntry(business("biz_1", "Riverside Dental"), guest);
    savePortfolioEntry(business("biz_2", "Hillcrest Vet"), guest);
    const guestBytes = [...raw.data].reduce((n, [k, v]) => n + k.length + v.length, 0);
    const full = browser(guestBytes * 2);
    for (const [key, value] of raw.data) full.raw.setItem(key, value);
    const switchBusiness = vi.fn(async () => ({ ok: true as const }));

    await saveGuestWork(full.guest, full.account, switchBusiness);

    const copies = Object.values(loadPortfolio(full.account));
    expect(copies.map((p) => p.practiceName)).toEqual(["Riverside Dental"]);
    expect(switchBusiness).toHaveBeenCalledWith(copies[0].businessId);
    expect(guestImportNotSavedToast(["Hillcrest Vet"])).toBe(
      "Hillcrest Vet did not save. Check browser storage, then export your guest work.",
    );
    expect(toasts.error).toHaveBeenCalledWith(guestImportNotSavedToast(["Hillcrest Vet"]));
    expect(toasts.success).toHaveBeenCalledWith(
      "Riverside Dental is in your account. It syncs from here on.",
    );
    // Hillcrest Vet is still guest work to copy; Riverside Dental is not.
    expect(importableGuestBusinesses(full.guest, full.account).map((p) => p.practiceName)).toEqual([
      "Hillcrest Vet",
    ]);
    expect(guestImportNotSavedToast(["Hillcrest Vet", "Oak Street Books"])).toBe(
      "Hillcrest Vet and Oak Street Books did not save. Check browser storage, then export your guest work.",
    );
  });

  it("remembers Not now per business, so the question stays down and the recovery panel still offers them", () => {
    const { guest, account } = browser();
    savePortfolioEntry(business("biz_1", "Riverside Dental"), guest);
    savePortfolioEntry(business("biz_2", "Hillcrest Vet"), guest);

    declineGuestWork(guest, account);

    expect(readLocal("precog.guest-import.declined.biz_1", account)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(readLocal("precog.guest-import.declined.biz_2", account)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(importableGuestBusinesses(guest, account, { includeDeclined: false })).toEqual([]);
    expect(importableGuestBusinesses(guest, account).map((p) => p.practiceName)).toEqual([
      "Riverside Dental",
      "Hillcrest Vet",
    ]);
    expect(Object.keys(loadPortfolio(account))).toEqual([]);
  });

  it("keeps the setup dialog inert while the question is open above it", () => {
    const setup = <div role="dialog" aria-modal="true" id="setup" />;
    expect(
      renderToStaticMarkup(<BehindGuestImportPrompt open>{setup}</BehindGuestImportPrompt>),
    ).toBe('<div inert=""><div role="dialog" aria-modal="true" id="setup"></div></div>');
    expect(
      renderToStaticMarkup(<BehindGuestImportPrompt open={false}>{setup}</BehindGuestImportPrompt>),
    ).toBe('<div><div role="dialog" aria-modal="true" id="setup"></div></div>');
  });

  it("says why when the switch is refused, and when nothing was copied", async () => {
    const { guest, account } = browser();
    savePortfolioEntry(business("biz_1", "Riverside Dental"), guest);
    await saveGuestWork(guest, account, async () => ({
      ok: false,
      reason: "Choose a version first.",
    }));
    expect(toasts.error).toHaveBeenCalledWith("Choose a version first.");
    expect(toasts.success).not.toHaveBeenCalled();

    const empty = browser();
    const switchBusiness = vi.fn(async () => ({ ok: true as const }));
    await saveGuestWork(empty.guest, empty.account, switchBusiness);
    expect(switchBusiness).not.toHaveBeenCalled();
    expect(GUEST_IMPORT_NOT_SAVED).toBe(
      "The copy did not save. Check browser storage, then export your guest work.",
    );
    expect(toasts.error).toHaveBeenLastCalledWith(GUEST_IMPORT_NOT_SAVED);
  });

  it("renders nothing when the browser holds no guest work", () => {
    expect(renderToStaticMarkup(<GuestImportPrompt />)).toBe("");
  });
});
