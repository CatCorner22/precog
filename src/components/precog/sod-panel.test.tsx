import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { defaultProfile } from "@/lib/precog/practice-profile";
import { ReadOnlyPracticeProvider } from "@/lib/precog/read-only-practice";
import { resolveTemplate } from "@/lib/precog/active-template";
import * as detect from "@/lib/precog/sod/detect";
import { SodPanel } from "./sod-panel";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock("@/lib/precog/sod/detect", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/precog/sod/detect")>();
  return { ...actual, detectSodConflicts: vi.fn(actual.detectSodConflicts) };
});

const render = (withShellReport: boolean, initialView?: string) => {
  const profile = defaultProfile("general");
  const tpl = resolveTemplate(profile);
  const report = detect.detectSodConflicts(
    tpl,
    profile.staff,
    detect.sodDetectionOptions(tpl, profile.dualRelease),
  );
  vi.mocked(detect.detectSodConflicts).mockClear();
  const html = renderToStaticMarkup(
    <ReadOnlyPracticeProvider profile={profile}>
      <SodPanel report={withShellReport ? report : undefined} initialView={initialView} />
    </ReadOnlyPracticeProvider>,
  );
  return { html, runs: vi.mocked(detect.detectSodConflicts).mock.calls.length };
};

describe("the duty-conflict tab", () => {
  it("shows the shell's report instead of running the check again", () => {
    const own = render(false);
    const shell = render(true);
    expect(own.runs).toBeGreaterThan(0);
    expect(shell.runs).toBe(own.runs - 1);
    expect(shell.html).toBe(own.html);
  });
});

describe("the duty-conflict tab's views", () => {
  it("opens on Duty conflicts unless the address names another view", () => {
    expect(render(true).html).toContain('id="sod-view-conflicts"');
    expect(render(true, "nonsense").html).toContain('id="sod-view-conflicts"');
    const controls = render(true, "controls").html;
    expect(controls).toContain('id="sod-view-controls"');
    expect(controls).toMatch(/<h2[^>]*>Controls<\/h2>/);
  });

  it("names the views and the figure in plain words, and links to the team", () => {
    const { html } = render(true);
    expect(html).toContain("Duty assignments");
    expect(html).not.toContain("Duty map");
    expect(html).toContain("Duties kept apart");
    expect(html).not.toContain("Segregation health");
    expect(html).toContain(">Controls<");
    expect(html).toContain(">Edit the team<");
  });

  it("counts open conflicts with no decision, and lets each card log one or judge it not valid", () => {
    const { html } = render(true);
    expect(html).toContain("No decision yet");
    expect(html).toContain("Open, with no logged decision");
    expect(html).not.toContain("Open, no decision");
    expect(html).toContain(">Log a decision<");
    expect(html).toContain(">Not valid<");
  });
});

describe("the duty-conflict tab's note on duties from job titles", () => {
  it("asks the owner to confirm the duties under Team, naming who", () => {
    const sample = defaultProfile("general");
    const people = resolveTemplate(sample)
      .people.slice(0, 3)
      .map((person, index) =>
        index === 0 ? { ...person, dutiesFromTitle: true as const } : person,
      );
    const profile = { ...sample, customPeople: people };
    const html = renderToStaticMarkup(
      <ReadOnlyPracticeProvider profile={profile}>
        <SodPanel />
      </ReadOnlyPracticeProvider>,
    );
    expect(html).toContain(
      `One of your 3 people carries the usual duties for their job title. Confirm them under Team: ${people[0].name}.`,
    );
    expect(html).not.toContain("Check them under Team");
    expect(html).toContain("I checked them: they are right");
  });
});
