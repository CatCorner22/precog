/**
 * The setup pieces that need no job-title catalog: the grid's limits, the
 * name an unnamed business gets, and the profile a finished setup becomes.
 * Kept apart from ./own-team so the pages that read only these never load
 * the job-title catalog.
 */

import { defaultDualReleasePolicy, mitigatedSodRuleIds } from "../controls/dual-release";
import { resolveTemplate } from "../active-template";
import { MAX_BUSINESS_NAME } from "../business-id";
import { inPlaceEntry } from "../control-entries";
import { industryHasOwner } from "../industry";
import { deriveStaffFromTeam, independentReconciliationFromTeam } from "../sod/derive-staff";
import { mergeStaffIntoVariables } from "../scoring/dynamic-variables";
import { withDecision } from "../profile-actions";
import { makeDecisionId, type PracticeProfile } from "../practice-profile";
import type { EntitlementId } from "../sod/conflict-rules";
import type { Person } from "../types";
import { DAILY_TAKINGS_USD, hiddenDuties, type SetupAnswers } from "./setup-answers";

/** Maximum people the grid accepts; larger teams continue in the team editor. */
export const OWN_TEAM_MAX = 60;

/**
 * Longest job title kept, in characters: long enough for real titles such as
 * "Site Director / Physical Therapist - Riverside" and cut nowhere else.
 */
export const MAX_ROLE_LENGTH = 80;

/** The name an own business gets when the owner leaves the name blank. */
export const OWN_BUSINESS_FALLBACK_NAME = "My business";

/**
 * A fresh profile for the owner's own business: their name, their people, no
 * sample relations, no sample dual-release exceptions, and staff figures
 * derived from the team they entered.
 */
export function ownBusinessProfile(
  base: PracticeProfile,
  input: { practiceName: string; people: Person[]; answers?: SetupAnswers },
): PracticeProfile {
  const { answers } = input;
  const hidden: ReadonlySet<EntitlementId> = answers
    ? hiddenDuties(answers)
    : new Set<EntitlementId>();
  const people = answers
    ? input.people.map((person) => ({
        ...person,
        ...(person.entitlements
          ? {
              entitlements: person.entitlements.filter(
                (duty) => !hidden.has(duty as EntitlementId),
              ),
            }
          : {}),
      }))
    : input.people;
  // A blank name stays neutral; the sample business's name is not this business's.
  const practiceName =
    input.practiceName.trim().slice(0, MAX_BUSINESS_NAME) || OWN_BUSINESS_FALLBACK_NAME;
  const ownTemplate = resolveTemplate({ ...base, customPeople: people, customRelations: [] });
  const policyStaff = {
    ...base.staff,
    ...(answers?.bankSecondApproval === "yes" ? { dualControlPayments: true } : {}),
    ...(answers?.bankRec === "outside"
      ? { independentBankRec: true, bankRecSource: "outside" as const }
      : {}),
  };
  // The dual-release approver roles are read off this team, not the sample's,
  // and no sample exception comes along.
  const dualRelease = { ...defaultDualReleasePolicy(ownTemplate, policyStaff), exceptions: [] };
  const riskVariables = answers
    ? {
        ...base.riskVariables,
        dailyCashExposure:
          answers.dailyTakings === "unsure"
            ? base.riskVariables.dailyCashExposure
            : DAILY_TAKINGS_USD[answers.dailyTakings],
        hasSecurityCameras: answers.cameras === "yes",
        hasAlarmAccess: answers.alarm === "yes",
        hasBondedCashHandlers: answers.backgroundChecks === "yes",
      }
    : base.riskVariables;
  const withTeam: PracticeProfile = {
    ...base,
    practiceName,
    customPeople: people,
    customRelations: [],
    dualRelease,
    ...(answers ? { setupAnswers: answers } : {}),
    onboardingComplete: true,
  };
  const staff = deriveStaffFromTeam(ownTemplate, policyStaff, {
    dualReleaseMitigatedRuleIds: mitigatedSodRuleIds(dualRelease, ownTemplate),
  });
  // Whether someone independent reconciles is read off the duties the owner
  // ticked; the toggle in Business settings can still overrule it later.
  const finalStaff =
    answers?.bankRec === "outside"
      ? { ...staff, independentBankRec: true, bankRecSource: "outside" as const }
      : { ...staff, independentBankRec: independentReconciliationFromTeam(people) };
  let profile: PracticeProfile = {
    ...withTeam,
    staff: finalStaff,
    riskVariables: mergeStaffIntoVariables(riskVariables, finalStaff),
  };

  if (answers) {
    const controls = resolveTemplate(profile).controls;
    const now = new Date();
    const statementControlIds = ["c-sod-cash", "c-sod-ap"] as const;
    if (answers.ownerReadsStatement === "yes") {
      const statementText = industryHasOwner(profile.industry)
        ? "The owner opens and reads the bank statement each month (answered at setup)."
        : "A board member opens and reads the bank statement each month (answered at setup).";
      for (const id of statementControlIds) {
        const control = controls.find((item) => item.id === id);
        if (control)
          profile = withDecision(
            profile,
            inPlaceEntry(control, statementText, now),
            makeDecisionId(),
            now,
          );
      }
    }
    if (answers.bankRec === "outside") {
      const control = controls.find((item) => item.id === "c-sod-cash");
      if (control) {
        profile = withDecision(
          profile,
          inPlaceEntry(
            control,
            "An outside bookkeeper or CPA reconciles the bank account each month (answered at setup).",
            now,
          ),
          makeDecisionId(),
          now,
        );
      }
    }
  }

  return profile;
}
