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

  it("shows the figures an own team decides instead of offering sliders that would be put back", () => {
    const html = render(withPeople(defaultProfile("general"), team, "2026-09-25"));
    // Only the segregation score stays a slider.
    expect(html.match(/type="range"/g)).toHaveLength(1);
    expect(html).toContain("From your team: the people marked as working here.");
    expect(html).toContain("From the hire dates on your team.");
  });

  it("keeps the note and its button outside the slider's label", () => {
    const own = withPeople(defaultProfile("general"), team, "2026-09-25");
    const manual = withStaff(own, { ...own.staff, segregationScore: 10 });
    const html = render(manual);
    const label = html.match(/<label for="[^"]+">([^<]*)<\/label>/);
    expect(label?.[1]).toBe("Segregation score");
    expect(html).toMatch(/aria-describedby="[^"]+-note"/);
    expect(html).toContain("Use the score from your team&#x27;s duties");
  });
});
