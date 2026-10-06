import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  defaultDualReleasePolicy,
  evaluateRelease,
  type DualReleasePolicy,
  type ThresholdException,
} from "@/lib/precog/controls/dual-release";
import { dualReleaseLine } from "@/lib/precog/controls/dual-release-wording";
import { getIndustryTemplate } from "@/lib/precog/templates";
import { getIndustryCopy } from "@/lib/precog/templates/industry-copy";
import { ThresholdInput } from "./dual-release-channels-section";
import { DualReleaseExceptionsCard } from "./dual-release-exceptions-card";
import { DualReleaseEvalResult } from "./dual-release-parts";
import { conflictFactors } from "./sod-conflict-view";
import type { DualReleasePanelModel } from "./use-dual-release-panel";

const dental = getIndustryTemplate("dental");
const officeManager = "p2"; // Maya Chen, starts ACH payments

/** The dental policy, on, with the ACH channel at this threshold and no exceptions. */
function achAt(thresholdUsd: number): DualReleasePolicy {
  const on = defaultDualReleasePolicy(dental, {
    ...dental.staffComposition,
    dualControlPayments: true,
  });
  return {
    ...on,
    exceptions: [],
    rules: on.rules.map((r) => (r.channel === "ach" ? { ...r, thresholdUsd } : r)),
  };
}

/** The simulator's result for one ACH payment, as text. */
function checked(thresholdUsd: number, amountUsd: number): string {
  const result = evaluateRelease(dental, achAt(thresholdUsd), {
    channel: "ach",
    amountUsd,
    initiatorPersonId: officeManager,
  });
  return renderToStaticMarkup(<DualReleaseEvalResult eval={result} />).replaceAll("<!-- -->", "");
}

describe("a payment threshold kept to the cent", () => {
  it("shows the cents when the threshold has them", () => {
    const html = checked(999.5, 999.75);
    expect(html).toContain("$999.75 · two signers needed above $999.50");
    expect(html).toContain("Dual release required above $999.50.");
    expect(html).not.toContain("$1,000");
  });

  it("keeps whole dollars when the threshold has no cents", () => {
    const html = checked(1000, 1500);
    expect(html).toContain("$1,500 · two signers needed above $1,000");
    expect(html).not.toContain("$1,000.00");
    expect(checked(999.5, 400)).toContain(
      "Amount $400 is at or under threshold $999.50 — one signer may release it.",
    );
  });

  it("quotes the policy's threshold to the cent wherever a screen names it", () => {
    expect(dualReleaseLine(achAt(999.5), "rule-vendor-create-pay")).toContain(
      "ACH / vendor electronic pay above $999.50",
    );
    expect(dualReleaseLine(achAt(500), "rule-vendor-create-pay")).toContain(
      "ACH / vendor electronic pay above $500;",
    );
    // The duty-conflict card's line for a pair dual release covers only above the threshold.
    const covered = {
      personName: "Maya Chen",
      ownerHeld: false,
      dualReleaseMitigated: true,
      entitlementA: "create_vendor",
      entitlementB: "release_payment",
    } as const;
    expect(conflictFactors(covered, undefined, 999.5)[1]).toBe(
      "Dual release covers payments over $999.50 only",
    );
    expect(conflictFactors(covered, undefined, 2500)[1]).toBe(
      "Dual release covers payments over $2,500 only",
    );
  });

  it("shows an exception's threshold to the cent", () => {
    const exception: ThresholdException = {
      id: "ex-1",
      label: "Lab supplier",
      channels: ["ach"],
      action: "raise_threshold",
      thresholdUsd: 3500.75,
      enabled: true,
      reason: "Monthly invoice",
      createdAt: "2026-10-01",
    };
    const model = {
      people: [],
      tpl: dental,
      policy: achAt(500),
      seed: getIndustryCopy("dental").dualReleaseSeed,
      showExForm: false,
      setShowExForm: () => {},
      exForm: {},
      updateExForm: () => {},
      exceptions: [exception],
      toggleExChannel: () => {},
      addException: () => {},
      toggleException: () => {},
      removeException: () => {},
    } as unknown as DualReleasePanelModel;
    const html = renderToStaticMarkup(<DualReleaseExceptionsCard model={model} />);
    expect(html).toContain("$3,500.75");
  });
});

describe("the threshold field", () => {
  it("is a text field with a decimal keypad, so the browser never empties '1,000' or '$500'", () => {
    const html = renderToStaticMarkup(
      <ThresholdInput channel="ach" value={999.5} disabled={false} onCommit={() => {}} />,
    );
    expect(html).toContain('type="text"');
    expect(html).toContain('inputMode="decimal"');
    expect(html).not.toContain('type="number"');
    expect(html).toContain('value="999.5"');
  });
});
