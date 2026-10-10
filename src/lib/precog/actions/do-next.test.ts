import { describe, expect, it } from "vitest";
import { resolveTemplate } from "../active-template";
import { INDUSTRIES } from "../industry";
import { defaultProfile } from "../practice-profile";
import { UNANSWERED } from "../onboarding/setup-answers";
import { detectSodConflicts, sodDetectionOptions } from "../sod/detect";
import { openFindings, partialDualReleaseCoverage } from "../sod/open-findings";
import { buildStartHereModel } from "../start-here/model";
import type { IntegrationDriftSummary } from "../integrations/drift-summary";
import { buildOwnTeam, ownBusinessProfile } from "../onboarding/own-team";
import { concentrationMove } from "../report/report-summary";
import {
  DO_NEXT_DRIFT_MAX,
  DO_NEXT_STEPS_MAX,
  doNextDrift,
  doNextList,
  doNextSteps,
  SPLIT_STEP_WITHOUT_NAMED_ROLE,
  splitStepLabel,
  stepLineOnScreen,
  type DoNextStep,
} from "./do-next";
import { CONTROL_CATALOG, type ControlId } from "../evidence/controls";
import type { DetectedConflict } from "../sod/detect";

const TODAY = new Date(2026, 8, 26);

const DRIFT: IntegrationDriftSummary = {
  updatedAt: "2026-09-20T12:00:00.000Z",
  source: "both",
  headline: "Books and access disagree",
  qboEmployeesNotOnMap: 2,
  qboPeopleNotInBooks: 1,
  qboVendorsAdded: 3,
  accessPending: 4,
};

function sample(industry: (typeof INDUSTRIES)[number]["id"], drift?: IntegrationDriftSummary) {
  const profile = { ...defaultProfile(industry), integrationDriftSummary: drift };
  const template = resolveTemplate(profile);
  const sod = detectSodConflicts(
    template,
    profile.staff,
    sodDetectionOptions(template, profile.dualRelease),
  );
  const open = openFindings(
    sod.conflicts,
    partialDualReleaseCoverage(profile.dualRelease, sod.conflicts),
  );
  return { profile, template, open, sod };
}

describe("doNextList", () => {
  it.each(INDUSTRIES.map((i) => i.id))("%s sample: Home's list is doNextList", (industry) => {
    const { profile, template, open, sod } = sample(industry);
    const home = buildStartHereModel({ profile, template, today: TODAY }).firstSteps;
    const list = doNextList({
      industry,
      open,
      staff: { assignments: sod.assignments, teamSize: profile.staff.teamSize },
      integrationDriftSummary: profile.integrationDriftSummary,
      accessReconciliation: profile.accessReconciliation,
    });
    expect(home.items).toEqual(list);
    expect(home.steps).toEqual(doNextSteps(list));
    expect(list.length).toBeGreaterThan(0);
    expect(doNextSteps(list).length).toBeLessThanOrEqual(DO_NEXT_STEPS_MAX);
  });

  it.each(INDUSTRIES.map((i) => i.id))(
    "%s sample: the drift items come last, after every ranked control",
    (industry) => {
      const { profile, template, open, sod } = sample(industry, DRIFT);
      const list = doNextList({
        industry,
        open,
        staff: { assignments: sod.assignments, teamSize: profile.staff.teamSize },
        integrationDriftSummary: DRIFT,
        accessReconciliation: profile.accessReconciliation,
      });
      const kinds = list.map((item) => item.kind);
      const firstDrift = kinds.indexOf("drift");
      expect(firstDrift).toBeGreaterThan(0);
      expect(kinds.slice(firstDrift).every((k) => k === "drift")).toBe(true);
      expect(doNextDrift(list)).toHaveLength(DO_NEXT_DRIFT_MAX);
      // Home reads the same list with the drift reading on the profile.
      expect(buildStartHereModel({ profile, template, today: TODAY }).firstSteps.items).toEqual(
        list,
      );
    },
  );

  it("ranks the controls by the open findings they answer", () => {
    const { profile, open } = sample("dental");
    const steps = doNextSteps(
      doNextList({
        industry: "dental",
        open,
        integrationDriftSummary: null,
        accessReconciliation: profile.accessReconciliation,
      }),
    );
    const answers = steps.map((s) => s.answers);
    expect(answers).toEqual([...answers].sort((a, b) => b - a));
  });

  it("leaves the setup-reported statement control off the list and names it", () => {
    const { profile, template } = sample("general");
    const withSetupAnswer = {
      ...profile,
      setupAnswers: { ...UNANSWERED, ownerReadsStatement: "yes" as const },
    };
    const home = buildStartHereModel({
      profile: withSetupAnswer,
      template,
      today: TODAY,
    }).firstSteps;
    expect(home.steps.map((step) => step.control.id)).not.toContain("owner-opens-bank-statement");
    expect(home.alreadyInPlace.map((control) => control.id)).toContain(
      "owner-opens-bank-statement",
    );
  });

  it("lists only drift items when no duty conflict is open", () => {
    const list = doNextList({
      industry: "dental",
      open: [],
      integrationDriftSummary: DRIFT,
      accessReconciliation: null,
    });
    expect(list.every((item) => item.kind === "drift")).toBe(true);
    expect(
      doNextList({
        industry: "dental",
        open: [],
        integrationDriftSummary: null,
        accessReconciliation: null,
      }),
    ).toEqual([]);
  });
});

describe("the split-one-duty-out step", () => {
  const firstStep = (profile: ReturnType<typeof defaultProfile>) => {
    const template = resolveTemplate(profile);
    return buildStartHereModel({ profile, template, today: TODAY }).firstSteps.steps[0];
  };

  it.each(INDUSTRIES.map((i) => i.id))(
    "%s sample: names the person and the duty, or says which duty to move",
    (industry) => {
      const { profile, open, sod } = sample(industry);
      const step = firstStep(profile);
      expect(step?.control.id).toBe("split-one-duty-out");
      const label = step!.control.label;
      expect(label).not.toMatch(/concentrated role|even just/);
      expect(label).toBe(
        splitStepLabel(open, concentrationMove(open), {
          assignments: sod.assignments,
          teamSize: profile.staff.teamSize,
        }),
      );
    },
  );

  it("names Maya Chen on the dental sample", () => {
    expect(firstStep(defaultProfile("dental"))?.control.label).toBe(
      "Move one duty, enter write-offs, away from Maya Chen: it closes 4 of the 20 open duty conflicts",
    );
  });

  it("never names the bank reconciliation when someone else does it", () => {
    const people = buildOwnTeam(
      [
        {
          name: "Robin Lead",
          role: "Office Manager",
          duties: [
            "create_vendor",
            "release_payment",
            "enter_invoices",
            "approve_writeoffs",
            "post_adjustments",
            "post_payments",
          ],
        },
        { name: "Sam Books", role: "Outside bookkeeper", duties: ["bank_reconcile"] },
        { name: "Kim Desk", role: "Front Desk", duties: ["collect_cash"] },
      ],
      "general",
    );
    const profile = ownBusinessProfile(defaultProfile("general"), {
      practiceName: "Robin's shop",
      people,
    });
    const label = firstStep(profile)?.control.label ?? "";
    expect(label).toContain("Robin Lead");
    expect(label).not.toMatch(/bank/i);
    // With nobody holding half the conflicts, the step still names no bank duty.
    expect(SPLIT_STEP_WITHOUT_NAMED_ROLE).not.toMatch(/bank/i);
  });
});

describe("a step as the screens word it", () => {
  const step = (id: ControlId, label = CONTROL_CATALOG[id].label) =>
    ({
      control: { ...CONTROL_CATALOG[id], label },
      supportingCaseIds: [],
      asApplied: "",
      answers: 1,
    }) as DoNextStep;
  const finding = (
    personName: string,
    a: DetectedConflict["entitlementA"],
    b: DetectedConflict["entitlementB"],
    labelA: string,
    labelB: string,
  ) => ({ personName, entitlementA: a, entitlementB: b, labelA, labelB }) as DetectedConflict;
  const sam = finding(
    "Sam",
    "collect_cash",
    "post_payments",
    "Take payment from customers",
    "Record payments received",
  );
  const lisa = finding(
    "Lisa",
    "release_payment",
    "bank_reconcile",
    "Release payments",
    "Reconcile the bank account",
  );

  it("names the finding whose two duties the control watches before a more severe one it half watches", () => {
    // Bank reconciliation watches releasing payments but not setting up suppliers.
    const ana = finding(
      "Ana",
      "create_vendor",
      "release_payment",
      "Set up suppliers",
      "Release payments",
    );
    expect(stepLineOnScreen(step("independent-bank-reconciliation"), [ana, sam])).toBe(
      "Sam can both take payment from customers and record payments received: someone other than the person who banks the money reconciles the account",
    );
    // With no finding it watches whole, the most severe one it half watches.
    expect(stepLineOnScreen(step("positive-pay"), [sam, ana])).toBe(
      "Ana can both set up suppliers and release payments: turn on Positive Pay so the bank only pays checks on a list you upload",
    );
  });

  it("says someone other than the person who reconciles, by name, when that person is in the pair", () => {
    expect(stepLineOnScreen(step("independent-bank-reconciliation"), [lisa, sam])).toBe(
      "Lisa can both release payments and reconcile the bank account: someone other than Lisa reconciles the account",
    );
  });

  it("names the person for the split step that names nobody, and keeps one that names its person", () => {
    expect(
      stepLineOnScreen(step("split-one-duty-out", SPLIT_STEP_WITHOUT_NAMED_ROLE), [lisa]),
    ).toBe(
      "Lisa can both release payments and reconcile the bank account: move one of the two duties to someone who holds neither",
    );
    const named =
      "Move one duty, release payments, away from Lisa: it closes 1 of the 1 open duty conflicts";
    expect(stepLineOnScreen(step("split-one-duty-out", named), [lisa])).toBe(named);
  });

  it("keeps the step's own words when it answers no open finding", () => {
    expect(stepLineOnScreen(step("mandatory-time-away"), [lisa])).toBe(
      CONTROL_CATALOG["mandatory-time-away"].label,
    );
  });
});
