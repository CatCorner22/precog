import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { defaultProfile } from "@/lib/precog/practice-profile";
import { withPeople, withStaff } from "@/lib/precog/profile-actions";
import { ReadOnlyPracticeProvider } from "@/lib/precog/read-only-practice";
import type { Person } from "@/lib/precog/types";
import { PracticeSetup } from "./practice-setup";

const render = (profile: ReturnType<typeof defaultProfile>) =>
  renderToStaticMarkup(
    <ReadOnlyPracticeProvider profile={profile}>
      <PracticeSetup />
    </ReadOnlyPracticeProvider>,
  );

const team: Person[] = [
  { id: "a", name: "Ana", role: "Owner", active: true, owner: true, tenureYears: 8 },
  { id: "b", name: "Ben", role: "Clerk", active: true, tenureYears: 2 },
];

describe("Business profile card", () => {
  it("lets the sample's team size be set and offers a reset to the sample business", () => {
    const html = render(defaultProfile("general"));
    expect(html.match(/type="range"/g)).toHaveLength(3);
    expect(html).toContain("Reset to the sample business");
    expect(html).not.toContain("demo");
  });

  it("shows the business name as saved and caps typing at the 80 characters a save keeps", () => {
    const html = render({ ...defaultProfile("general"), practiceName: "Corner Bistro" });
    expect(html).toMatch(/<input maxLength="80"[^>]*value="Corner Bistro"/);
  });

  it("shows the figures an own team decides instead of offering sliders that would be put back", () => {
    const own = withPeople(defaultProfile("general"), team, "2026-09-25");
    const html = render(own);
    // No sliders: the segregation score and the bank reconciliation answer
    // come from the team's duties too, shown read-only.
    expect(html.match(/type="range"/g)).toBeNull();
    expect(html).toContain("From your team: the people marked as working here.");
    expect(html).toContain("From the hire dates on your team.");
    expect(html.match(/From your team&#x27;s duties/g)).toHaveLength(2);
    expect(html).not.toContain("Use the score from your team");
    // Even a profile carrying a score passed in by hand shows the duties' figure.
    const tried = render(withStaff(own, { ...own.staff, segregationScore: 3 }));
    expect(tried).toContain(`<span class="tabular text-fg">${own.staff.segregationScore}</span>`);
  });

  it("keeps the sample's note outside the segregation slider's label", () => {
    const html = render(defaultProfile("general"));
    const label = html.match(/<label for="[^"]+">([^<]*)<\/label>/);
    expect(label?.[1]).toBe("Team size");
    expect(html).toMatch(/aria-describedby="[^"]+-note"/);
    expect(html).toContain("An estimate for the sample team.");
  });
});
