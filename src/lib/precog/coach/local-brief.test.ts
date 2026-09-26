import { afterEach, describe, expect, it, vi } from "vitest";
import { runLocalAgentLoop } from "../llm/agent-loop";
import { buildOwnTeam, ownBusinessProfile } from "../onboarding/own-team";
import { defaultProfile } from "../practice-profile";
import { withDecision } from "../profile-actions";
import { journalEntry } from "@/components/precog/pioneer-coach-parts";
import {
  DEFAULT_COACH_QUESTION,
  fallbackBrief,
  isConflictQuestion,
  localBrief,
  openConflictsByPerson,
} from "./local-brief";
import { pioneerProfileFrom } from "./pioneer-profile";

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
      "This week: give one of Grace Kim's duties (set up suppliers or release payments) to someone else, and open the bank statement yourself before anyone else handles it.",
    );
    expect(brief.markdown).toContain("Sofia Delgado");
    expect(brief.markdown).not.toMatch(/deductible|policy limit/i);
    // The industry example's register and people never appear as this clinic's.
    expect(brief.markdown).not.toMatch(/Insurance denial appeals|Jordan|Maya Chen/);
  });

  it("never names an insurance lever while the policy figures are defaults", () => {
    const sample = pioneerProfileFrom(defaultProfile("dental") as never);
    const { brief } = localBrief(SOD, { profile: sample, question: SOD }, sample);
    const moves = [...brief.decisions.map((d) => d.action), brief.frontierNextMove].join(" ");
    expect(moves).not.toMatch(/deductible|policy limit|premium/i);
    expect(brief.markdown).toContain("## Your open duty conflicts");
    expect(brief.markdown).toContain("Maya Chen");
  });

  it("keeps owner-held pairs out of the conflicts it leads with", () => {
    const people = openConflictsByPerson(clinic());
    expect(people.map((p) => p.personName)).not.toContain("Ellen Marchetti");
    expect(people[0].personName).toBe("Grace Kim");
  });

  it("builds a brief from the team's conflicts when the full brief cannot be computed", () => {
    const brief = fallbackBrief(clinic(), EMBEZZLEMENT);
    expect(brief.chickenLittleWarnings[0]).toMatch(/^Part of the full brief could not be computed/);
    expect(brief.decisions.map((d) => d.action)).toContain(
      "Mark who can do each item on Who knows what",
    );
    expect(brief.markdown).toContain(
      "**Grace Kim** (Bookkeeper): set up suppliers and release payments (fix first)",
    );
  });

  it("names a conflict's severity in the Start here words, not the severity id", () => {
    const profile = clinic();
    const { brief } = localBrief(EMBEZZLEMENT, { profile, question: EMBEZZLEMENT }, profile);
    expect(brief.decisions[0].rationale).toContain("a conflict to fix first");
    expect(brief.markdown).not.toMatch(/a (critical|high|medium) conflict/);
  });

  it("answers a question about someone leaving with what stops, not the generic brief", () => {
    const sample = pioneerProfileFrom(defaultProfile("dental") as never);
    const leaves = "If my front desk lead leaves, what breaks first?";
    const other = "Give me a plain-English board brief on residual risk.";
    const asked = localBrief(leaves, { profile: sample, question: leaves }, sample).brief;
    const generic = localBrief(other, { profile: sample, question: other }, sample).brief;
    expect(asked.markdown).toContain("## Your question");
    expect(asked.markdown).toMatch(/If Jordan Blake \(Front Desk Lead\) is away or leaves/);
    expect(asked.frontierNextMove).not.toBe(generic.frontierNextMove);
    // The move carries its register link, so a Journal entry logged from it is
    // followed up next time instead of recommended again.
    expect(asked.decisions[0].link).toMatchObject({ tab: "knowledge", step: "cover" });
    expect(asked.decisions[0].link?.id).toBeTruthy();
    expect(asked.decisions[0].link?.personId).toBeTruthy();
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
    expect(result.brief.chickenLittleWarnings[0]).toMatch(/^Part of the full brief/);
    expect(logged.mock.calls[0][0]).toContain("TypeError");
    expect(localBrief(EMBEZZLEMENT, { profile, question: EMBEZZLEMENT }, profile).partial).toBe(
      false,
    );
  });
});
