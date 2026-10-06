import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { EngagementRecord } from "@/lib/precog/firm/engagement-row";
import type { FirmMember } from "@/lib/precog/firm/store";

vi.mock("@/lib/precog/firm/engagement-server", () => ({
  getEngagement: vi.fn(),
  saveEngagement: vi.fn(),
  setEngagementStatus: vi.fn(),
}));
vi.mock("@/lib/precog/firm/grant-server", () => ({
  endFirmAccess: vi.fn(),
  getBusinessGrant: vi.fn(),
}));

const {
  END_ENGAGEMENT,
  ENGAGEMENT_ENDED_TOAST,
  ENGAGEMENT_HEADING,
  ENGAGEMENT_NOT_SAVED,
  ENGAGEMENT_REOPENED,
  ENGAGEMENT_SAVED,
  ARCHIVE_DOWNLOADED,
  ARCHIVE_FAILED,
  DOWNLOAD_ARCHIVE,
  EngagementCard,
  EngagementForm,
  NOT_SET,
  PERIOD_FROM_LABEL,
  PERIOD_TO_LABEL,
  PREPARER_LABEL,
  REOPEN_ENGAGEMENT,
  REVIEWER_LABEL,
  SAVE_ENGAGEMENT,
  ENGAGEMENT_OWNER_SETS,
  SCOPE_LABEL,
  endEngagementPrompt,
  engagementStatusText,
  HAND_BACK,
  HAND_BACK_FAILED,
  handBackPrompt,
  handedBackToast,
} = await import("./engagement-card");

const members: FirmMember[] = [
  { userId: "own", name: "Ola North", email: "o@n.test", role: "owner", joinedAt: "" },
  { userId: "rev", name: "", email: "rev@n.test", role: "reviewer", joinedAt: "" },
];

const active: EngagementRecord = {
  scope: "Duty map",
  periodStart: "2026-01-01",
  periodEnd: "2026-12-31",
  status: "active",
  endedAt: null,
  preparerUserId: "own",
  reviewerUserId: "rev",
};
const ended: EngagementRecord = {
  ...active,
  status: "ended",
  endedAt: "2026-10-04T15:00:00.000Z",
};

function form(engagement: EngagementRecord, isOwner: boolean): string {
  return renderToStaticMarkup(
    <EngagementForm
      businessName="Ortiz Dental"
      members={members}
      isOwner={isOwner}
      engagement={engagement}
    />,
  );
}

describe("the engagement block", () => {
  it("pins its labels, buttons and toasts", () => {
    expect([
      ENGAGEMENT_HEADING,
      SCOPE_LABEL,
      PERIOD_FROM_LABEL,
      PERIOD_TO_LABEL,
      PREPARER_LABEL,
      REVIEWER_LABEL,
      NOT_SET,
      SAVE_ENGAGEMENT,
      END_ENGAGEMENT,
      REOPEN_ENGAGEMENT,
      ENGAGEMENT_SAVED,
      ENGAGEMENT_ENDED_TOAST,
      ENGAGEMENT_REOPENED,
      ENGAGEMENT_NOT_SAVED,
    ]).toEqual([
      "Engagement",
      "Scope",
      "Period from",
      "Period to",
      "Preparer",
      "Reviewer",
      "Not set",
      "Save engagement",
      "End engagement",
      "Reopen engagement",
      "Engagement saved.",
      "Engagement ended.",
      "Engagement reopened.",
      "Precog did not save the engagement.",
    ]);
  });

  it("prints the fields, the members by name or address, and the status", () => {
    const html = form(active, true);
    for (const text of [
      ENGAGEMENT_HEADING,
      SCOPE_LABEL,
      PERIOD_FROM_LABEL,
      PERIOD_TO_LABEL,
      PREPARER_LABEL,
      REVIEWER_LABEL,
      SAVE_ENGAGEMENT,
      "Status: Active",
    ]) {
      expect(html).toContain(text);
    }
    expect(html).toContain('maxLength="600"');
    expect(html).toContain(">Duty map</textarea>");
    expect(html).toContain("8/600");
    expect(html).toContain('type="date"');
    expect(html).toContain('value="2026-01-01"');
    expect(html).toContain('<option value="">Not set</option>');
    expect(html).toContain(">Ola North</option>");
    expect(html).toContain(">rev@n.test</option>");
    expect(html).not.toContain('disabled=""');
  });

  it("shows a preparer or reviewer the engagement read-only, with no Save", () => {
    // saveEngagement refuses anyone but the firm owner (CPA-8).
    const html = form(active, false);
    expect(html).toContain(">Duty map</textarea>");
    expect(html).not.toContain(SAVE_ENGAGEMENT);
    expect(html.match(/disabled=""/g)?.length).toBe(5); // scope, two dates, two selects
    expect(html).toContain(ENGAGEMENT_OWNER_SETS);
    expect(ENGAGEMENT_OWNER_SETS).toBe(
      "The firm owner sets the scope, the period, the preparer and the reviewer. You can read them here.",
    );
    expect(form(active, true)).not.toContain(ENGAGEMENT_OWNER_SETS);
  });

  it("gives the owner alone End or Reopen", () => {
    expect(form(active, false)).not.toContain(END_ENGAGEMENT);
    expect(form(ended, false)).not.toContain(REOPEN_ENGAGEMENT);
    expect(form(active, true)).toContain(END_ENGAGEMENT);
    expect(form(active, true)).not.toContain(REOPEN_ENGAGEMENT);
    expect(form(ended, true)).toContain(REOPEN_ENGAGEMENT);
    expect(form(ended, true)).not.toContain(END_ENGAGEMENT);
  });

  it("disables every input and Save while ended, and says since when", () => {
    const html = form(ended, true);
    expect(html).toContain("Status: Ended on Oct 4, 2026");
    expect(html.match(/disabled=""/g)?.length).toBe(6); // scope, two dates, two selects, Save
    expect(engagementStatusText({ status: "ended", endedAt: null })).toBe("Status: Ended");
    expect(engagementStatusText({ status: "active", endedAt: null })).toBe("Status: Active");
  });

  it("asks before ending, without the irreversible warning", () => {
    const prompt = endEngagementPrompt("Ortiz Dental");
    expect(prompt).toBe(
      "End the engagement with Ortiz Dental? The firm's members can then read its map, Monthly review and locked versions but not change them, until the firm owner reopens it.",
    );
    expect(prompt).not.toContain("You cannot undo this.");
  });

  it("gives the owner alone the archive download, open while ended", () => {
    expect([DOWNLOAD_ARCHIVE, ARCHIVE_DOWNLOADED, ARCHIVE_FAILED]).toEqual([
      "Download engagement archive",
      "Archive downloaded.",
      "Precog could not build the archive. Try again.",
    ]);
    expect(form(active, false)).not.toContain(DOWNLOAD_ARCHIVE);
    expect(form(ended, false)).not.toContain(DOWNLOAD_ARCHIVE);
    expect(form(active, true)).toContain(`>${DOWNLOAD_ARCHIVE}</button>`);
    // Ended: the six edit controls are disabled, the download is not.
    const html = form(ended, true);
    expect(html).toContain(`>${DOWNLOAD_ARCHIVE}</button>`);
    expect(html.match(/disabled=""/g)?.length).toBe(6);
  });

  it("prints the archive progress in a status line that is there before it, and holds the button", () => {
    const building = (archiveProgress: string | null) =>
      renderToStaticMarkup(
        <EngagementForm
          businessName="Ortiz Dental"
          members={members}
          isOwner
          engagement={active}
          archiveProgress={archiveProgress}
        />,
      );
    // The archive's status line is the second on the block (the first is the
    // engagement's status); it is mounted empty, so its first message is
    // announced as a change, not inserted with the element.
    const archiveStatus = (html: string) =>
      [...html.matchAll(/role="status"[^>]*>([^<]*)</g)].map((m) => m[1])[1];
    const idle = building(null);
    expect(archiveStatus(idle)).toBe("");
    expect(idle).not.toContain('disabled=""');
    const counting = building("");
    expect(archiveStatus(counting)).toBe("");
    expect(counting.match(/disabled=""/g)?.length).toBe(1);
    const html = building("Building the archive: version 2 of 3…");
    expect(archiveStatus(html)).toBe("Building the archive: version 2 of 3…");
    expect(html.match(/disabled=""/g)?.length).toBe(1);
    // A member who is not the owner has no download and no archive status line.
    expect(form(active, false).match(/role="status"/g)).toHaveLength(1);
  });

  it("offers the hand-back to the owner alone, on a business its owner shared", () => {
    const withHandBack = (isOwner: boolean, onHandBack?: () => void) =>
      renderToStaticMarkup(
        <EngagementForm
          businessName="Ortiz Dental"
          members={members}
          isOwner={isOwner}
          engagement={active}
          onHandBack={onHandBack}
        />,
      );
    expect(HAND_BACK).toBe("Hand back to its owner");
    expect(withHandBack(true, () => undefined)).toContain(`>${HAND_BACK}</button>`);
    // A client the firm set up itself has no hand-back; a member never sees one.
    expect(withHandBack(true)).not.toContain(HAND_BACK);
    expect(withHandBack(false, () => undefined)).not.toContain(HAND_BACK);
  });

  it("asks before handing back, saying the firm loses the versions it locked", () => {
    expect(handBackPrompt("Ortiz Dental")).toBe(
      "Hand Ortiz Dental back to its owner? The firm loses access to its map and Monthly review and can no longer open the versions it locked; the owner keeps them. Download the engagement archive first if the firm needs a copy.",
    );
    expect(handBackPrompt("Ortiz Dental")).not.toContain("You cannot undo this.");
    expect(handedBackToast("Ortiz Dental")).toBe("Ortiz Dental is back with its owner.");
    expect(HAND_BACK_FAILED).toBe("Precog could not hand the business back.");
  });

  it("renders nothing until the engagement loads", () => {
    expect(
      renderToStaticMarkup(
        <EngagementCard businessId="biz_1" businessName="Ortiz" members={members} isOwner />,
      ),
    ).toBe("");
  });
});
