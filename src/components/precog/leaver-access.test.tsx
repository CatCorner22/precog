import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { defaultProfile, type PracticeProfile } from "@/lib/precog/practice-profile";
import { ReadOnlyPracticeProvider } from "@/lib/precog/read-only-practice";
import { LeaverAccessList } from "./leaver-access";

/** A nonprofit's own team, with Ana marked as left on Oct 7 after her last day on Oct 3. */
const profile: PracticeProfile = {
  ...defaultProfile("nonprofit"),
  businessId: "biz_np",
  onboardingComplete: true,
  customPeople: [
    { id: "p-dir", name: "Dee Director", role: "Executive Director", active: true },
    { id: "p-ana", name: "Ana Ruiz", role: "Bookkeeper", active: false, lastDay: "2026-10-03" },
  ],
  leaverAccessChecks: [
    {
      id: "lac_1",
      personId: "p-ana",
      name: "Ana Ruiz",
      role: "Bookkeeper",
      industry: "nonprofit",
      notedOn: "2026-10-07",
      source: "marked",
    },
  ],
};

describe("the leavers still to check", () => {
  it("gives the last day and the day Ana was marked as left", () => {
    const html = renderToStaticMarkup(
      <ReadOnlyPracticeProvider profile={profile}>
        <LeaverAccessList />
      </ReadOnlyPracticeProvider>,
    );
    expect(html).toContain("Ana Ruiz (Bookkeeper)");
    expect(html).toMatch(/last day Oct 3(, 2026)?, marked as left Oct 7(, 2026)?/);
    expect(html).toContain("Check pay and sign-ins");
    expect(html).toContain("copy donor records");
    expect(html).not.toContain("customer");
  });
});
