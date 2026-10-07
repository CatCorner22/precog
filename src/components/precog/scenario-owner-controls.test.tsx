import type { ReactNode } from "react";
import { prerender } from "react-dom/static";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CONTROL_CONFIRM_TAB, resolveTemplate } from "@/lib/precog/active-template";
import { defaultProfile, type PracticeProfile } from "@/lib/precog/practice-profile";
import { PresentationProvider } from "@/lib/precog/presentation";
import { ReadOnlyPracticeProvider } from "@/lib/precog/read-only-practice";
import { scenarioUnfolding } from "@/lib/precog/scenario-unfolding";
import type { Person } from "@/lib/precog/types";
import { scenarioWatch } from "./scenario-page";
import { ScenarioRunner } from "./scenario-runner";
import { ScenarioWatchCard } from "./scenario-watch-card";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  useNavigate: () => () => {},
}));

/**
 * An owner's own office: every payroll and vendor duty is ticked for
 * someone, and no one holds a pair, so the payroll and vendor paths are
 * closed by the team. The owner has confirmed no control.
 */
const team: Person[] = [
  {
    id: "o",
    name: "Olu Park",
    role: "Owner",
    active: true,
    owner: true,
    entitlements: ["edit_payroll_master"],
  },
  {
    id: "p",
    name: "Pia Lund",
    role: "Office manager",
    active: true,
    entitlements: ["enter_payroll"],
  },
  {
    id: "r",
    name: "Rae Cho",
    role: "Bookkeeper",
    active: true,
    entitlements: ["release_payment"],
  },
  {
    id: "v",
    name: "Vic Hale",
    role: "Front desk",
    active: true,
    entitlements: ["create_vendor"],
  },
  { id: "i", name: "Ines Roy", role: "Billing", active: true, entitlements: ["enter_invoices"] },
];
const own: PracticeProfile = {
  ...defaultProfile("dental"),
  practiceName: "Park Dental",
  onboardingComplete: true,
  customPeople: team,
};

const confirm = (controlId: string) => ({
  id: `confirm-${controlId}`,
  createdAt: "2026-09-20T12:00:00.000Z",
  subject: controlId,
  kind: "monitor" as const,
  note: "This runs here",
  linkedTab: CONTROL_CONFIRM_TAB,
  linkedId: controlId,
  linkedIndustry: "dental" as const,
});

function card(profile: PracticeProfile, scenarioId: string, ownerConfirmed: Set<string> | null) {
  const tpl = resolveTemplate(profile);
  const scenario = tpl.scenarios.find((s) => s.id === scenarioId)!;
  const watch = scenarioWatch(
    tpl,
    scenario,
    [],
    new Set(),
    new Set(),
    undefined,
    undefined,
    ownerConfirmed,
  );
  return renderToStaticMarkup(
    ScenarioWatchCard({ scenario, unfolding: scenarioUnfolding(scenario.id)!, watch }),
  ).replace(/&#x27;|’/g, "'");
}

async function page(profile: PracticeProfile, item: string): Promise<string> {
  const { prelude } = await prerender(
    <PresentationProvider>
      <ReadOnlyPracticeProvider profile={profile}>
        <ScenarioRunner item={item} />
      </ReadOnlyPracticeProvider>
    </PresentationProvider>,
  );
  return (await new Response(prelude).text())
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<!-- -->/g, "")
    .replace(/&#x27;|’/g, "'");
}

describe("the scenario card on an owner's own business", () => {
  it("never calls a control the owner did not confirm in place", () => {
    for (const [scenarioId, name] of [
      ["sc-payroll-ghost", "Payroll approval"],
      ["sc-vendor-fraud", "Split duties: vendor setup and payment"],
      ["sc-front-desk-leaves", "Denial aging review"],
    ]) {
      const html = card(own, scenarioId!, new Set());
      expect(html, name).not.toContain("is marked in place");
      expect(html).toContain(`“${name}” is Precog's example. You have not confirmed it runs here.`);
    }
  });

  it("calls a control in place once the owner confirmed it", () => {
    const html = card(
      { ...own, decisions: [confirm("c-payroll")] },
      "sc-payroll-ghost",
      new Set(["c-payroll"]),
    );
    expect(html).toContain("“Payroll approval” is marked in place.");
    expect(html).not.toContain("Precog's example");
  });

  it("keeps the sample business's own controls as the sample has them", () => {
    const html = card(defaultProfile("dental"), "sc-front-desk-leaves", null);
    expect(html).toContain("“Denial aging review” is marked in place.");
  });

  it("reads the owner's confirmations on the page itself", async () => {
    const before = await page(own, "sc-payroll-ghost");
    expect(before).not.toContain("is marked in place");
    expect(before).toContain("“Payroll approval” is Precog's example.");
    const after = await page({ ...own, decisions: [confirm("c-payroll")] }, "sc-payroll-ghost");
    expect(after).toContain("“Payroll approval” is marked in place.");
  });
});

describe("the assumed loss when the owner's team closes the path", () => {
  const text = (html: string) => html.replace(/<[^>]*>/g, "|").replace(/\|+/g, "|");

  it("leads with the closed path and shows the loss as the example figure, smaller", async () => {
    const html = await page(own, "sc-payroll-ghost");
    const t = text(html);
    expect(t).toContain("|Nobody on the team holds both duties this needs.|");
    const lead = t.indexOf(
      "Your team closes this path:| nobody on it holds both duties. The loss below is the scenario's example figure.",
    );
    const loss = t.indexOf("|Example: Assumed loss if it happens|");
    expect(lead).toBeGreaterThan(0);
    expect(loss).toBeGreaterThan(lead);
    expect(t).toContain("|Example: Assumed loss retained by practice|");
    expect(t).not.toContain("|Assumed loss if it happens|");
    // Still shown, at the small size.
    expect(t.slice(loss)).toMatch(/^\|Example: Assumed loss if it happens\|about \$/);
    expect(html).toMatch(
      /Example: Assumed loss if it happens<\/p><p class="[^"]*\btext-base\b[^"]*">about \$/,
    );
  });

  it("keeps the loss as the lead figure where someone holds both duties", async () => {
    const holder = team.map((p) =>
      p.id === "r" ? { ...p, entitlements: [...(p.entitlements ?? []), "enter_payroll"] } : p,
    );
    const t = text(await page({ ...own, customPeople: holder }, "sc-payroll-ghost"));
    expect(t).not.toContain("Your team closes this path");
    expect(t).toContain("|Assumed loss if it happens|about $");
  });
});
