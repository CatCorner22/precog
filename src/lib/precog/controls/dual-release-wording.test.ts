import { describe, expect, it } from "vitest";
import { resolveTemplate } from "../active-template";
import { defaultDualReleasePolicy } from "./dual-release";
import { closingSteps, dualReleaseLine, withLiveThreshold } from "./dual-release-wording";

const tpl = resolveTemplate({ industry: "dental" });
const off = defaultDualReleasePolicy(tpl, {
  ...tpl.staffComposition,
  dualControlPayments: false,
});
const on = { ...off, enabled: true };

describe("dualReleaseLine and closingSteps", () => {
  it("quotes the live policy's thresholds, never a template's", () => {
    expect(dualReleaseLine(on, "rule-vendor-create-pay")).toBe(
      "Your dual-release policy requires a second person on ACH / vendor electronic pay above $500; Paper checks above $500; New vendor master at every amount",
    );
    expect(dualReleaseLine(off, "rule-vendor-create-pay")).toMatch(
      /^Dual release is off for this in your policy/,
    );
    expect(dualReleaseLine(on, "rule-sign-rec")).toBeNull();
    const closes = closingSteps(
      [
        "Dual release on payments > $1,000",
        "Owner signs new vendor form",
        "Dual-release policy active on related channel",
      ],
      on,
      "rule-vendor-create-pay",
    );
    expect(closes.join(" ")).not.toContain("$1,000");
    expect(closes).toContain("Owner signs new vendor form");
    expect(closes[closes.length - 1]).toMatch(/above \$500/);
    // A control the owner already has is done, not a step to take.
    const withReview = closingSteps(
      ["Owner opens the bank statement first", "The CFO reviews each reconciliation"],
      off,
      "rule-release-rec",
      ["The CFO reviews each reconciliation"],
    );
    expect(withReview).toEqual(["Owner opens the bank statement first"]);
  });

  it("drops the threshold-less 'Dual release above threshold' default from the steps", () => {
    const steps = closingSteps(
      ["Someone who enters no bills approves each one", "Dual release above threshold"],
      on,
      "rule-invoice-pay",
    );
    expect(steps).toEqual(["Someone who enters no bills approves each one"]);
  });
});

describe("withLiveThreshold", () => {
  const quoted = "Dual release on payments > $1,000";

  it("leaves a control that quotes no dual-release threshold as written", () => {
    expect(withLiveThreshold("Owner signs new vendor form", on, ["rule-vendor-create-pay"])).toBe(
      "Owner signs new vendor form",
    );
  });

  it("names no figure when no policy is at hand", () => {
    expect(withLiveThreshold(quoted, undefined, ["rule-vendor-create-pay"])).toBe(
      "Dual release above the thresholds in your dual-release policy",
    );
  });

  it("says off when the policy is off", () => {
    expect(withLiveThreshold(quoted, off, ["rule-vendor-create-pay"])).toBe(
      "Dual release (off in your dual-release policy)",
    );
  });

  it("quotes the covering channels when the policy is on", () => {
    expect(withLiveThreshold(quoted, on, ["rule-vendor-create-pay"])).toBe(
      "Dual release per your policy: ACH / vendor electronic pay above $500; Paper checks above $500; New vendor master at every amount",
    );
  });

  it("says the policy has no channel, not that it is off, when it is on but covers none of the rules", () => {
    expect(withLiveThreshold(quoted, on, ["rule-invoice-pay"])).toBe(
      "Dual release (your dual-release policy has no channel for this)",
    );
  });

  it("rewrites the bare 'Dual release above threshold' default to the live policy", () => {
    expect(
      withLiveThreshold("Dual release above threshold", on, ["rule-vendor-create-pay"]),
    ).toMatch(/^Dual release per your policy: .*above \$500/);
  });
});
