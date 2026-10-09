import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { prerender } from "react-dom/static";
import type { ReactNode } from "react";
import { resolveTemplate } from "@/lib/precog/active-template";
import { defaultProfile } from "@/lib/precog/practice-profile";
import { ReadOnlyPracticeProvider } from "@/lib/precog/read-only-practice";
import { buildStartHereModel } from "@/lib/precog/start-here/model";
import { StartHere } from "./start-here";
import { StartHereFiguresSection } from "./start-here-figures-section";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  useNavigate: () => () => {},
}));

const auth = vi.hoisted(() => ({ user: null as null | { id: string }, isPending: false }));
vi.mock("@/lib/auth/use-current-user", () => ({
  useCurrentUserState: () => auth,
  useCurrentUser: () => auth.user,
}));

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function figures(registerReady: boolean) {
  const profile = defaultProfile("dental");
  const model = buildStartHereModel({
    profile,
    template: resolveTemplate(profile),
    today: new Date(2026, 9, 9),
  });
  return renderToStaticMarkup(
    <StartHereFiguresSection
      model={{ ...model.figures, registerReady, coverageIndex: 41 }}
      onOpenDetail={() => {}}
    />,
  );
}

describe("Start here's second figure", () => {
  it("is the next step, not a dash, until someone is marked on the register", () => {
    const html = figures(false);
    expect(text(html)).toContain("Next step Mark stand-ins About three minutes");
    expect(text(html)).toContain("who else can run each duty?");
    expect(html).not.toContain(">—<");
    expect(text(html)).not.toContain("Not assessed yet");
    expect(text(html)).not.toContain("Has a stand-in");
  });

  it("is the stand-in share once the register is marked", () => {
    const html = figures(true);
    expect(text(html)).toContain(
      "Has a stand-in 41% Share of work two or more people can run alone (weighted by criticality). Not a measured loss.",
    );
    expect(text(html)).not.toContain("Next step");
  });
});

/** Start here as the server draws it for this profile and sign-in state. */
async function startHere(profile = defaultProfile("dental")): Promise<string> {
  const { prelude } = await prerender(
    <ReadOnlyPracticeProvider profile={profile}>
      <StartHere onOpenDetail={() => {}} />
    </ReadOnlyPracticeProvider>,
  );
  return new Response(prelude).text();
}

describe("Start here's note that the business is saved on this device only", () => {
  const own = () => ({
    ...defaultProfile("dental"),
    onboardingComplete: true,
    practiceName: "Maple Street Dental",
    customPeople: [
      {
        id: "own-1",
        name: "Dana Reyes",
        role: "Owner",
        active: true,
        owner: true,
        entitlements: ["approve_payroll", "view_reports_only"],
      },
    ],
  });

  it("asks a signed-out owner to sign in once, under the heading, with the link", async () => {
    auth.user = null;
    auth.isPending = false;
    const html = await startHere(own());
    expect(html.match(/data-testid="keep-it-note"/g)).toHaveLength(1);
    expect(text(html)).toContain(
      "Saved on this device only. Sign in to keep this business on every device. Sign in",
    );
    expect(html).toContain('href="/login"');
    // Under the page header and above the figures.
    expect(html.indexOf("keep-it-note")).toBeGreaterThan(html.indexOf("</header>"));
    expect(html.indexOf("keep-it-note")).toBeLessThan(html.indexOf("Open duty conflicts"));
  });

  it("says nothing on the sample, while the session is still loading, or once signed in", async () => {
    auth.user = null;
    auth.isPending = false;
    expect(await startHere()).not.toContain("keep-it-note");
    auth.isPending = true;
    expect(await startHere(own())).not.toContain("keep-it-note");
    auth.isPending = false;
    auth.user = { id: "u1" };
    expect(await startHere(own())).not.toContain("keep-it-note");
  });
});

describe("Start here order", () => {
  it("leads with the steps, then the conflict count, and parks the stand-in figure under Why we say this", async () => {
    auth.user = null;
    auth.isPending = false;
    const html = await startHere();
    const steps = html.indexOf("Do these first");
    const conflicts = html.indexOf("Open duty conflicts");
    const why = html.lastIndexOf("Why we say this");
    expect(steps).toBeGreaterThan(0);
    expect(steps).toBeLessThan(conflicts);
    expect(conflicts).toBeLessThan(why);
    const standIn = html.indexOf("Has a stand-in");
    const next = html.indexOf("Mark stand-ins");
    expect(Math.max(standIn, next)).toBeGreaterThan(why);
  });
});
