import { describe, expect, it } from "vitest";
import { resolveTemplate } from "../active-template";
import { INDUSTRIES } from "../industry";
import { defaultProfile } from "../practice-profile";
import { detectSodConflicts, sodDetectionOptions } from "../sod/detect";
import { openFindings, partialDualReleaseCoverage } from "../sod/open-findings";
import { buildStartHereModel } from "../start-here/model";
import type { IntegrationDriftSummary } from "../integrations/drift-summary";
import {
  DO_NEXT_DRIFT_MAX,
  DO_NEXT_STEPS_MAX,
  doNextDrift,
  doNextList,
  doNextSteps,
} from "./do-next";

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
  return { profile, template, open };
}

describe("doNextList", () => {
  it.each(INDUSTRIES.map((i) => i.id))("%s sample: Home's list is doNextList", (industry) => {
    const { profile, template, open } = sample(industry);
    const home = buildStartHereModel({ profile, template, today: TODAY }).firstSteps;
    const list = doNextList({
      open,
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
      const { profile, template, open } = sample(industry, DRIFT);
      const list = doNextList({
        open,
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
        open,
        integrationDriftSummary: null,
        accessReconciliation: profile.accessReconciliation,
      }),
    );
    const answers = steps.map((s) => s.answers);
    expect(answers).toEqual([...answers].sort((a, b) => b - a));
  });

  it("lists only drift items when no duty conflict is open", () => {
    const list = doNextList({
      open: [],
      integrationDriftSummary: DRIFT,
      accessReconciliation: null,
    });
    expect(list.every((item) => item.kind === "drift")).toBe(true);
    expect(
      doNextList({ open: [], integrationDriftSummary: null, accessReconciliation: null }),
    ).toEqual([]);
  });
});
