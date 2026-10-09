import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveTemplate } from "../active-template";
import { formatDayRange } from "../dates";
import { runLocalAgentLoop } from "../llm/agent-loop";
import { buildOwnTeam, ownBusinessProfile } from "../onboarding/own-team";
import { defaultProfile } from "../practice-profile";
import { firstName } from "../text";
import { withDecision } from "../profile-actions";
import { CONTROL_CATALOG, controlForIndustry } from "../evidence/controls";
import { starterScenarioLabel } from "../scoring/scope";
import { journalEntry } from "./journal-entry";
import {
  DEFAULT_COACH_QUESTION,
  fallbackBrief,
  isConflictQuestion,
  localBrief,
  openConflictsByPerson,
  scenarioAnswer,
} from "./local-brief";
import { pioneerProfileFrom } from "./pioneer-profile";
import { nonprofitLeaderPeople } from "@/test/nonprofit-leader-team";
import * as scenarioQuestion from "./scenario-question";

vi.mock("../llm/agent-loop", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../llm/agent-loop")>();
  return { ...actual, runLocalAgentLoop: vi.fn(actual.runLocalAgentLoop) };
});

const EMBEZZLEMENT = "What should I fix this week to reduce embezzlement risk?";
const SOD = "Where are my biggest SoD gaps right now?";

function clinic() {
  const people = buildOwnTeam([
    {
      name: "Ellen Marchetti",
      role: "Physician/Owner",
      duties: ["approve_payroll", "bank_reconcile"],
    },
    { name: "Grace Kim", role: "Bookkeeper", duties: ["create_vendor", "release_payment"] },
    { name: "Sofia Delgado", role: "Front Desk", duties: ["collect_cash", "post_payments"] },
    { name: "Rosa Alvarez", role: "Medical Assistant", duties: [] },
  ]);
  return pioneerProfileFrom(
    ownBusinessProfile(defaultProfile("dental"), { practiceName: "Northside", people }) as never,
  );
}

describe("local advisor brief", () => {
  it("leads an embezzlement question with this business's own conflicts, by person", () => {
    const profile = clinic();
    const { brief } = localBrief(EMBEZZLEMENT, { profile, question: EMBEZZLEMENT }, profile);
    expect(brief.decisions[0].action).toBe(
      "Give one of Grace Kim's duties to someone else: set up suppliers or release payments",
    );
    expect(brief.decisions.some((d) => d.action.startsWith("Owner opens the bank statement"))).toBe(
      true,
    );
    expect(brief.frontierNextMove).toBe(
      "This week: move one of Grace Kim's duties to someone else, and open the bank statement yourself, before anyone else.",
    );
    expect(brief.markdown).toContain("Sofia Delgado");
    expect(brief.markdown).not.toMatch(/deductible|policy limit/i);
    expect(brief.markdown).not.toContain("## This week\nThis week:");
    // The industry example's register and people never appear as this clinic's.
    expect(brief.markdown).not.toMatch(/Insurance denial appeals|Jordan|Maya Chen/);
  });

  it("never names an insurance lever while the policy figures are defaults", () => {
    const sample = pioneerProfileFrom(defaultProfile("dental") as never);
    const { brief } = localBrief(SOD, { profile: sample, question: SOD }, sample);
    const moves = [...brief.decisions.map((d) => d.action), brief.frontierNextMove].join(" ");
    expect(moves).not.toMatch(/deductible|policy limit|premium/i);
    expect(brief.markdown).toContain("## Answer");
    expect(brief.markdown).toContain("Maya Chen");
  });

  it("keeps owner-held pairs out of the conflicts it leads with", () => {
    const people = openConflictsByPerson(clinic());
    expect(people.map((p) => p.personName)).not.toContain("Ellen Marchetti");
    expect(people[0].personName).toBe("Grace Kim");
  });

  it("builds a brief from the team's conflicts when the full brief cannot be computed", () => {
    const brief = fallbackBrief(clinic(), EMBEZZLEMENT);
    expect(brief.chickenLittleWarnings[0]).toMatch(
      /^Pioneer could not compute part of the full brief/,
    );
    expect(brief.decisions.map((d) => d.action)).toContain(
      "Mark who can do each item on Who knows what",
    );
    expect(brief.markdown).toContain(
      "**Grace Kim**: set up suppliers and release payments (critical)",
    );
    expect(brief.markdown).not.toContain("## This week\nThis week:");
  });

  it("uses the industry-specific owner statement rationale", () => {
    for (const industry of ["dental", "retail"] as const) {
      const profile = pioneerProfileFrom(defaultProfile(industry) as never);
      const { brief } = localBrief(
        DEFAULT_COACH_QUESTION,
        { profile, question: DEFAULT_COACH_QUESTION },
        profile,
      );
      const control = controlForIndustry(CONTROL_CATALOG["owner-opens-bank-statement"], industry);
      const decision = brief.decisions.find((move) => move.action === control.label);

      expect(decision?.rationale).toBe(
        `${control.why} You can do this yourself this week; it takes minutes.`,
      );
    }
  });

  it("names a conflict's severity in the Start here badge words, not a residual band", () => {
    const profile = clinic();
    const { brief } = localBrief(EMBEZZLEMENT, { profile, question: EMBEZZLEMENT }, profile);
    expect(brief.decisions[0].rationale).toContain("Critical duty conflict");
    // "Fix first" names the residual band (index 80 or more), not a severity.
    expect(brief.markdown).not.toMatch(/conflict to fix first|\(fix first\)/);
  });

  it("answers a question about someone leaving with what stops, not the generic brief", () => {
    const sample = pioneerProfileFrom(defaultProfile("dental") as never);
    const leaves = "If my front desk lead leaves, what breaks first?";
    const other = "Give me a plain-English board brief on residual risk.";
    const asked = localBrief(leaves, { profile: sample, question: leaves }, sample).brief;
    const generic = localBrief(other, { profile: sample, question: other }, sample).brief;
    expect(asked.markdown).toContain("## Answer");
    expect(asked.markdown).not.toContain("Your question");
    expect(asked.markdown).not.toMatch(/^Question:/m);
    expect(asked.markdown).toMatch(/If Jordan Blake \(Front Desk Lead\) is away or leaves/);
    expect(asked.frontierNextMove).not.toBe(generic.frontierNextMove);
    // The move carries its register link, so a Journal entry logged from it is
    // followed up next time instead of recommended again.
    expect(asked.decisions[0].link).toMatchObject({ tab: "knowledge", step: "cover" });
    expect(asked.decisions[0].link?.id).toBeTruthy();
    expect(asked.decisions[0].link?.personId).toBeTruthy();
  });

  it("answers a named write-off scenario with its figures, unfolding, and warning signs", () => {
    const sample = pioneerProfileFrom(defaultProfile("dental") as never);
    const question = "Walk me through a write-off abuse scenario and its controls.";
    const { brief, steps } = localBrief(question, { profile: sample, question }, sample);

    expect(brief.markdown).toContain("## Answer");
    expect(brief.markdown).toContain("### Write-offs posted without a second approval");
    expect(brief.markdown).toMatch(/\*\*Precog's assumptions:\*\* assumed retained/);
    expect(brief.markdown).toContain("**How it unfolds**");
    expect(brief.markdown).toContain(
      "1. A staff member posts a large adjustment against a customer balance.",
    );
    expect(brief.markdown).toContain("**Warning signs**");
    expect(brief.markdown).toContain("Large adjustments post under one login.");
    expect(brief.markdown).not.toContain("not counted in your totals");
    expect(steps.find((step) => step.phase === "synthesize")?.detail).toContain(
      `${brief.decisions.length} recommended moves`,
    );
  });

  it("answers a write-off question about how the abuse unfolds", () => {
    const profile = pioneerProfileFrom(defaultProfile("dental") as never);
    const question = "How would write-off abuse unfold?";
    const { brief } = localBrief(question, { profile, question }, profile);

    expect(brief.markdown).toContain("## Answer");
    expect(brief.markdown).toContain("Write-offs posted without a second approval");
  });

  it("answers only the named subcontractor scenario", () => {
    const profile = pioneerProfileFrom(defaultProfile("construction") as never);
    const tpl = resolveTemplate(profile);
    const answer = scenarioAnswer(
      "Walk me through the Payments to a subcontractor that does not exist scenario",
      tpl,
      profile,
    );

    expect(answer?.filter((line) => line.startsWith("### "))).toEqual([
      "### Payments to a subcontractor that does not exist",
    ]);
  });

  it("shows the departure scenario before the absence answer", () => {
    const sample = pioneerProfileFrom(defaultProfile("dental") as never);
    const question = "Walk me through the front desk lead leaves scenario.";
    const scenario = resolveTemplate(sample).scenarios.find(
      (item) => item.id === "sc-front-desk-leaves",
    );
    if (!scenario) throw new Error("Missing dental departure scenario");
    const { brief } = localBrief(question, { profile: sample, question }, sample);
    const scenarioStart = brief.markdown.indexOf(`### ${scenario.title}`);
    const absenceStart = brief.markdown.indexOf(
      "If Jordan Blake (Front Desk Lead) is away or leaves",
    );

    expect(brief.markdown).toContain(scenario.description);
    expect(brief.markdown).toContain("**How it unfolds**");
    expect(brief.markdown).toContain("**Warning signs**");
    expect(scenarioStart).toBeGreaterThanOrEqual(0);
    expect(absenceStart).toBeGreaterThan(scenarioStart);
  });

  it("does not select a departure scenario from a person's name and leaves alone", () => {
    const sample = pioneerProfileFrom(defaultProfile("dental") as never);
    const question = "What would happen if Jordan Blake leaves?";
    const { brief } = localBrief(question, { profile: sample, question }, sample);

    expect(brief.markdown).not.toMatch(/^### /m);
    expect(brief.markdown).toContain("If Jordan Blake (Front Desk Lead) is away or leaves");
  });

  it("answers who is out today from the absence records", () => {
    const sample = pioneerProfileFrom(defaultProfile("dental") as never);
    const profile = { ...sample, plannedAbsences: [] };
    const question = "Who is out today?";
    const { brief } = localBrief(question, { profile, question, today: "2025-11-05" }, profile);

    expect(brief.markdown).toContain(
      "Nobody is recorded as out today. When someone calls in, open Who knows what and record them as out today.",
    );
  });

  it("reports today's unplanned absence, stopped work, hand-off state, and upcoming leave", () => {
    const sample = pioneerProfileFrom(defaultProfile("dental") as never);
    const template = resolveTemplate(sample);
    const absentPerson = template.people.find((person) => person.name === "Jordan Blake");
    const upcomingPerson = template.people.find((person) => person.id !== absentPerson?.id);
    if (!absentPerson) throw new Error("Missing dental sample person Jordan Blake");
    if (!upcomingPerson) throw new Error("Missing another dental sample person");
    const today = "2025-11-05";
    const profile = {
      ...sample,
      decisions: [],
      plannedAbsences: [
        {
          id: "unplanned-jordan",
          personId: absentPerson.id,
          industry: "dental" as const,
          from: today,
          to: today,
          unplanned: true,
        },
        {
          id: "planned-soon",
          personId: upcomingPerson.id,
          industry: "dental" as const,
          from: "2025-11-08",
          to: "2025-11-10",
        },
      ],
    };
    const question = "Who is out today?";
    const { brief } = localBrief(question, { profile, question, today }, profile);

    expect(brief.markdown).toContain("- Jordan Blake is out today (unplanned).");
    expect(brief.markdown).toContain(
      "  - Insurance denial appeals: Chris Patel covers; hand-off not logged yet.",
    );
    expect(brief.markdown).toContain(
      `Starting within a week: ${firstName(upcomingPerson.name)} (${formatDayRange("2025-11-08", "2025-11-10")}).`,
    );
    expect(brief.markdown).not.toContain("Nobody on the team holds both duties this needs.");
  });

  it("does not describe stops for an absence when the register is unassessed", () => {
    const sample = pioneerProfileFrom(defaultProfile("dental") as never);
    const person = resolveTemplate(sample).people.find(
      (candidate) => candidate.name === "Jordan Blake",
    );
    if (!person) throw new Error("Missing dental sample person Jordan Blake");
    const today = "2025-11-05";
    const profile = pioneerProfileFrom({
      industry: "dental",
      customRelations: [],
      plannedAbsences: [
        {
          id: "unplanned-jordan-unassessed",
          personId: person.id,
          industry: "dental",
          from: today,
          to: today,
          unplanned: true,
        },
      ],
    });
    const question = "Who is out today?";
    const { brief } = localBrief(question, { profile, question, today }, profile);

    expect(brief.markdown).toContain("- Jordan Blake is out today (unplanned).");
    expect(brief.markdown).not.toContain("  - Nothing rests on them alone.");
    expect(brief.markdown).not.toMatch(/^\s+- .+; hand-off /m);
    expect(brief.markdown).toContain(
      "Who knows what does not mark anyone yet, so Precog cannot say what stops.",
    );
  });

  it("uses setup answers for off-team duties in Pioneer scenario facts", () => {
    const team = buildOwnTeam([
      {
        name: "Payroll administrator",
        role: "Payroll administrator",
        duties: ["edit_payroll_master"],
      },
      {
        name: "Payment releaser",
        role: "Bookkeeper",
        duties: ["release_payment"],
      },
    ]);
    const profile = pioneerProfileFrom({
      industry: "general",
      customPeople: team,
      setupAnswers: { payroll: "none", bankRec: "outside" },
    });
    const question = "Walk me through the ghost payroll scenario.";
    const { brief } = localBrief(question, { profile, question }, profile);

    expect(brief.markdown).toContain(
      "Your setup answers place enter payroll outside the team, so nobody on the team holds both duties this needs.",
    );
    expect(brief.markdown).not.toContain("Tick whoever");
  });

  it("does not route a future absence question to today's answer", () => {
    const sample = pioneerProfileFrom(defaultProfile("dental") as never);
    const person = resolveTemplate(sample).people.find(
      (candidate) => candidate.name === "Jordan Blake",
    );
    if (!person) throw new Error("Missing dental sample person Jordan Blake");
    const today = "2025-11-05";
    const profile = {
      ...sample,
      plannedAbsences: [
        {
          id: "planned-next-week",
          personId: person.id,
          industry: "dental" as const,
          from: "2025-11-08",
          to: "2025-11-10",
        },
      ],
    };
    const question = "Who is out next week?";
    const { brief } = localBrief(question, { profile, question, today }, profile);

    expect(brief.markdown).not.toContain("Nobody is recorded as out today.");
  });

  it("does not treat an unassessed register as proof nobody can run a scenario alone", () => {
    const profile = clinic();
    const template = resolveTemplate(profile);
    const answer = scenarioAnswer(
      "Walk me through the front desk lead leaves scenario.",
      template,
      profile,
    )?.join("\n");

    expect(answer).toContain(
      "Insurance denial appeals: who can run it alone isn't recorded yet; mark it on Who knows what.",
    );
    expect(answer).not.toContain("nobody can run it alone");
  });

  it("uses item-level recording when another item makes the register assessed", () => {
    const profile = clinic();
    const template = resolveTemplate(profile);
    const scenario = template.scenarios.find((item) => item.id === "sc-front-desk-leaves");
    if (!scenario?.knowledgeId) throw new Error("Missing dental departure scenario knowledge");
    const scenarioItem = template.knowledge.find((item) => item.id === scenario.knowledgeId);
    const otherItem = template.knowledge.find((item) => item.id !== scenario.knowledgeId);
    const activePerson = template.people.find((person) => person.active);
    if (!scenarioItem || !otherItem || !activePerson) {
      throw new Error("Missing dental sample scenario facts");
    }
    const partiallyAssessed = {
      ...template,
      relations: [
        { personId: activePerson.id, knowledgeId: otherItem.id, level: "aware" as const },
      ],
    };
    const answer = scenarioAnswer(
      "Walk me through the front desk lead leaves scenario.",
      partiallyAssessed,
      profile,
    )?.join("\n");

    expect(answer).toContain(
      `${scenarioItem.name}: who can run it alone isn't recorded yet; mark it on Who knows what.`,
    );
    expect(answer).not.toContain(`${scenarioItem.name}: nobody can run it alone.`);
  });

  it("explains unassigned scenario duties instead of claiming there is no conflict", () => {
    const profile = clinic();
    const template = resolveTemplate(profile);
    const person = template.people[0];
    if (!person) throw new Error("Missing dental sample person");
    const answer = scenarioAnswer(
      "Walk me through a vendor fraud scenario.",
      {
        ...template,
        roleTemplates: {},
        people: [
          {
            ...person,
            id: "single-team-member",
            name: "Alex Example",
            role: "Bookkeeper",
            entitlements: ["release_payment", "enter_invoices"],
          },
        ],
        relations: [],
      },
      profile,
    )?.join("\n");

    expect(answer).toContain(
      "Nobody on the team is ticked for set up suppliers, so Precog cannot tell whether one person holds both duties this needs. Tick whoever does it on the Team tab.",
    );
    expect(answer).not.toContain("Nobody on the team holds both duties this needs.");
  });

  it("reports recorded holders when the sample register is assessed", () => {
    const profile = pioneerProfileFrom(defaultProfile("dental") as never);
    const template = resolveTemplate(profile);
    const answer = scenarioAnswer(
      "Walk me through the front desk lead leaves scenario.",
      template,
      profile,
    )?.join("\n");

    expect(answer).toContain("Insurance denial appeals: Jordan Blake can run it alone.");
    expect(answer).not.toContain("isn't recorded yet");
  });

  it("labels an unconfirmed owner-business starter scenario in its scenario answer", () => {
    const profile = clinic();
    const question = "Walk me through a write-off abuse scenario and its controls.";
    const { brief } = localBrief(question, { profile, question }, profile);
    const line = brief.markdown
      .split("\n")
      .find((text) => text.includes("### Write-offs posted without a second approval"));
    const tag = `(${starterScenarioLabel(profile.industry).replace(/^Sample scenarios/, "sample scenario")}, not counted in your totals)`;

    expect(line).toBeDefined();
    expect(line).toContain(tag);
  });

  it.each(["writeoff", "write-off", "write off"])(
    "recognizes the %s spelling of the write-off scenario",
    (phrase) => {
      const sample = pioneerProfileFrom(defaultProfile("dental") as never);
      const answers = scenarioAnswer(
        `Walk me through a ${phrase} abuse scenario and its controls.`,
        resolveTemplate(sample),
        sample,
      );

      expect(answers?.join("\n")).toContain("Write-offs posted without a second approval");
    },
  );

  it("compares the vendor and cash scenarios in the order named for retail", () => {
    const profile = pioneerProfileFrom(defaultProfile("retail") as never);
    const question = "Compare the vendor fraud and cash skimming scenarios for my store.";
    const { brief } = localBrief(question, { profile, question }, profile);
    const vendor = brief.markdown.indexOf("One person sets up vendors and pays them");
    const cash = brief.markdown.indexOf("One person posts payments and reconciles the bank");

    expect(brief.markdown).toContain("## Answer");
    expect(vendor).toBeGreaterThan(-1);
    expect(cash).toBeGreaterThan(-1);
    expect(vendor).toBeLessThan(cash);
  });

  it.each([DEFAULT_COACH_QUESTION, "What do I fix first this week to reduce embezzlement risk?"])(
    "does not add a scenario section for a general question: %s",
    (question) => {
      const sample = pioneerProfileFrom(defaultProfile("dental") as never);
      const { brief } = localBrief(question, { profile: sample, question }, sample);
      expect(brief.markdown).not.toContain("## Your question");
    },
  );

  it("keeps the Dental default brief below 900 words and within the short section order", () => {
    const sample = pioneerProfileFrom(defaultProfile("dental") as never);
    const { brief } = localBrief(
      DEFAULT_COACH_QUESTION,
      {
        profile: sample,
        question: DEFAULT_COACH_QUESTION,
      },
      sample,
    );
    const words = brief.markdown.match(/\S+/g)?.length ?? 0;

    expect(words).toBeLessThanOrEqual(900);
    expect(brief.markdown).not.toMatch(
      /^## (Order of fixes \(Precog's model\)|Four review lenses|Tradeoffs|Where the figures come from)$/m,
    );
    expect(brief.markdown).toContain("## Limits");
    expect(brief.markdown).toContain("Team of ");
    expect(brief.markdown).toContain("Most useful thing to verify next:");
    expect(brief.markdown).toContain(
      "Rankings use Precog's weights, not a measurement of this business.",
    );
    expect(brief.markdown).not.toMatch(/\(stack\)|If you /);
    expect(brief.markdown).not.toContain("## This week\nThis week:");
    expect(brief.markdown).not.toContain("not counted in your totals");
    expect(
      `${brief.frontierNextMove}\n${brief.decisions.map((d) => d.action).join("\n")}`,
    ).not.toContain("(stack)");
    const riskSection =
      brief.markdown.split("## Biggest open risks\n")[1]?.split("\n\n## ")[0] ?? "";
    const risks = riskSection.match(/^\d+\. \*\*/gm) ?? [];
    expect(risks).toHaveLength(3);
    expect(riskSection).toMatch(/\n\n\*\*What this has cost other businesses\*\*/);
    expect(riskSection).not.toMatch(/Drivers: (?:Severity level|Likelihood level)/);
  });

  it("follows up a cross-training move logged from the brief instead of recommending it again", () => {
    const sample = pioneerProfileFrom(defaultProfile("dental") as never);
    const q = "If my front desk lead leaves, what breaks first?";
    const first = localBrief(q, { profile: sample, question: q }, sample).brief.decisions[0];
    expect(first.action).toMatch(/^Cross-train /);
    const now = new Date();
    const logged = withDecision(sample, journalEntry(first, now), "d-coach", now);
    const next = localBrief(q, { profile: logged, question: q }, logged).brief;
    const actions = next.decisions.map((d) => d.action);
    expect(actions).not.toContain(first.action);
    expect(actions.some((a) => a.startsWith("In progress:"))).toBe(true);
  });

  it("matches conflict questions on whole words, and the default question on purpose", () => {
    expect(isConflictQuestion("How do I fix the office printer?")).toBe(true);
    expect(isConflictQuestion("prefix invoice numbers by location")).toBe(false);
    expect(isConflictQuestion("Who should cover the front desk when Ann is out?")).toBe(false);
    expect(isConflictQuestion(DEFAULT_COACH_QUESTION)).toBe(true);
  });
});

describe("local brief fallback", () => {
  afterEach(() => vi.restoreAllMocks());

  it("marks the conflict-only brief as partial, times it, and logs the error's class", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(runLocalAgentLoop).mockImplementationOnce(() => {
      throw new TypeError("a tool broke");
    });
    const profile = clinic();
    const result = localBrief(EMBEZZLEMENT, { profile, question: EMBEZZLEMENT }, profile);
    expect(result.partial).toBe(true);
    expect(result.toolResults).toEqual([]);
    expect(result.brief.chickenLittleWarnings[0]).toMatch(
      /^Pioneer could not compute part of the full brief/,
    );
    expect(logged.mock.calls[0][0]).toContain("TypeError");
    expect(localBrief(EMBEZZLEMENT, { profile, question: EMBEZZLEMENT }, profile).partial).toBe(
      false,
    );
  });

  it("returns the plain fallback when answer processing also throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(scenarioQuestion, "matchScenarios").mockImplementation(() => {
      throw new Error("scenario matching failed");
    });
    const profile = clinic();
    const question = "Walk me through a write-off abuse scenario and its controls.";
    const result = localBrief(question, { profile, question }, profile);

    expect(result.partial).toBe(true);
    expect(result.brief.markdown).toContain("## Situation");
    expect(result.brief.chickenLittleWarnings[0]).toMatch(
      /^Pioneer could not compute part of the full brief/,
    );
  });
});

describe("the bank-statement step for a business with no owner", () => {
  it("tells a nonprofit that a board member opens the statement", () => {
    const profile = { ...defaultProfile("nonprofit"), customPeople: nonprofitLeaderPeople() };
    const { brief } = localBrief(EMBEZZLEMENT, { profile, question: EMBEZZLEMENT }, profile);
    const statement = brief.decisions.find((d) => /opens the bank statement/.test(d.action));
    expect(statement?.action).toBe(
      "A board member opens the bank statement first, before anyone else handles it",
    );
    expect(brief.decisions.some((d) => d.action.startsWith("Owner opens"))).toBe(false);
  });
});
