import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { EngagementRecord } from "@/lib/precog/firm/engagement-row";
import type { FirmMember } from "@/lib/precog/firm/store";

vi.mock("@/lib/precog/firm/engagement-server", () => ({
  getEngagement: vi.fn(),
  saveEngagement: vi.fn(),
  setEngagementStatus: vi.fn(),
}));

const {
  END_ENGAGEMENT,
  ENGAGEMENT_ENDED_TOAST,
  ENGAGEMENT_HEADING,
  ENGAGEMENT_NOT_SAVED,
  ENGAGEMENT_REOPENED,
  ENGAGEMENT_SAVED,
  EngagementCard,
  EngagementForm,
  NOT_SET,
  PERIOD_FROM_LABEL,
  PERIOD_TO_LABEL,
  PREPARER_LABEL,
  REOPEN_ENGAGEMENT,
  REVIEWER_LABEL,
  SAVE_ENGAGEMENT,
  SCOPE_LABEL,
  endEngagementPrompt,
  engagementStatusText,
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
    const html = form(active, false);
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

  it("renders nothing until the engagement loads", () => {
    expect(
      renderToStaticMarkup(
        <EngagementCard businessId="biz_1" businessName="Ortiz" members={members} isOwner />,
      ),
    ).toBe("");
  });
});
