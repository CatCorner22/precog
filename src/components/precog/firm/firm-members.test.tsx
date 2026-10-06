import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FirmMembers } from "./firm-members";
import { removedMemberToasts, transferredOwnershipToasts } from "./firm-members-text";
import type { FirmContext, FirmMember } from "@/lib/precog/firm/store";

vi.mock("@/lib/precog/firm/server", () => ({
  inviteFirmMember: vi.fn(),
  leaveFirm: vi.fn(),
  removeFirmMember: vi.fn(),
  revokeFirmInvite: vi.fn(),
  setFirmMemberRole: vi.fn(),
  transferFirmOwnership: vi.fn(),
}));

const firm = (role: FirmContext["role"]): FirmContext => ({
  firmUserId: "ua",
  name: "North Advisors",
  plan: "assessment",
  role,
  letterhead: "",
  logoDataUrl: null,
  coverPage: true,
});

const members: FirmMember[] = [
  { userId: "ua", name: "Ada", email: "ada@north.test", role: "owner", joinedAt: "2026-01-01" },
  { userId: "ub", name: "Bea", email: "bea@north.test", role: "preparer", joinedAt: "2026-02-01" },
];

function render(role: FirmContext["role"]): string {
  return renderToStaticMarkup(
    <FirmMembers firm={firm(role)} members={members} invites={[]} onChange={() => undefined} />,
  );
}

describe("what the owner is told after removing a member", () => {
  it("counts the client businesses handed over, zero included", () => {
    expect(removedMemberToasts("Bea", [])).toEqual([
      "Removed Bea. 0 client businesses now sit under your account.",
    ]);
    expect(removedMemberToasts("Bea", [{ from: "biz_1", to: "biz_1", name: "Acme" }])).toEqual([
      "Removed Bea. 1 client business now sits under your account.",
    ]);
  });

  it("names each business that took a new address", () => {
    expect(
      removedMemberToasts("Bea", [
        { from: "biz_1", to: "biz_1", name: "Acme" },
        { from: "biz_2", to: "biz_2-0a1b2c3d", name: "Beta Dental" },
      ]),
    ).toEqual([
      "Removed Bea. 2 client businesses now sit under your account.",
      "Beta Dental was given a new address in the business list.",
    ]);
  });
});

describe("the people panel", () => {
  it("lists every member with a role control for the owner only", () => {
    expect(render("owner")).toContain('aria-label="Remove Bea"');
    expect(render("preparer")).not.toContain('aria-label="Remove Bea"');
  });

  it("says what each role does and what only the owner does", () => {
    expect(render("owner").replace(/\s+/g, " ")).toContain(
      "A preparer maps clients, records monthly review results and control checks, and locks reports. A reviewer does the same, reviews control checks, and reviews for issuance reports that someone else prepared. Every member sees every client of the firm. Only the owner deletes or restores a client, invites and removes members, and hands the firm to a colleague.",
    );
  });

  it("offers Make owner on each other member to the owner alone", () => {
    const owner = render("owner");
    expect(owner).toContain('aria-label="Make Bea the owner"');
    expect(owner.match(/Make owner</g)).toHaveLength(1);
    expect(render("reviewer")).not.toContain("Make owner");
    expect(render("preparer")).not.toContain("Make owner");
  });
});

describe("the prompts", () => {
  it("say the client businesses stay with the firm, and what a transfer hands over", async () => {
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("./firm-members.tsx", import.meta.url), "utf8"),
    );
    expect(source).toContain(
      "Remove ${name} from ${firm.name}? They lose access to the firm's clients, their share links to those clients stop working, and the client businesses they set up stay with the firm under your account.",
    );
    expect(source).toContain(
      "Leave ${firm.name}? You lose access to the firm's clients, your share links to those clients stop working, and the client businesses you set up stay with the firm. Businesses you kept outside the firm stay yours.",
    );
    expect(source).toContain(
      "Make ${name} the owner of ${firm.name}? They take the firm's clients, members, invitations and billing, and you stay on as a reviewer. Stripe's receipts and payment emails go to them from now on, and owner reminders for the firm's clients follow their settings. You cannot undo this.",
    );
    expect(source).toContain("transferredOwnershipToasts(name, firm.name, res.moved)");
  });
});

describe("what the old owner is told after handing over the firm", () => {
  it("names the new owner, and nothing more when no client business moved", () => {
    expect(transferredOwnershipToasts("Bea", "North Advisors", [])).toEqual([
      "Bea now owns North Advisors.",
    ]);
  });

  it("counts the client businesses that moved to the new owner and names each renamed one", () => {
    expect(
      transferredOwnershipToasts("Bea", "North Advisors", [
        { from: "biz_1", to: "biz_1", name: "Acme" },
      ]),
    ).toEqual([
      "Bea now owns North Advisors.",
      "1 client business you set up now sits under Bea's account. You keep working on it as a reviewer.",
    ]);
    expect(
      transferredOwnershipToasts("Bea", "North Advisors", [
        { from: "biz_1", to: "biz_1", name: "Acme" },
        { from: "biz_2", to: "biz_2-0a1b2c3d", name: "Beta Dental" },
      ]),
    ).toEqual([
      "Bea now owns North Advisors.",
      "2 client businesses you set up now sit under Bea's account. You keep working on them as a reviewer.",
      "Beta Dental was given a new address in the business list.",
    ]);
  });
});
