import { describe, expect, it } from "vitest";
import {
  assignmentsAfterSplit,
  chooseDutySplit,
  chooseSplitSequence,
  openedRules,
} from "./duty-split";
import type { DetectedConflict } from "./detect";
import type { EntitlementId } from "./conflict-rules";

function conflict(
  personId: string,
  personName: string,
  a: EntitlementId,
  b: EntitlementId,
  severity: DetectedConflict["severity"] = "high",
): DetectedConflict {
  return {
    id: `${personId}:${a}:${b}`,
    ruleId: `${a}:${b}`,
    personId,
    personName,
    role: "Staff",
    entitlementA: a,
    entitlementB: b,
    labelA: a,
    labelB: b,
    severity,
    title: `${a} + ${b}`,
    why: "One person holds both.",
    fraudPath: "Act alone.",
    score: 80,
    compensatingControls: [],
    controlsInPlace: [],
    ownerHeld: false,
    residualRiskAccepted: false,
    dualReleaseMitigated: false,
    processIds: [],
  };
}

describe("chooseDutySplit", () => {
  it("moves the shared duty that closes two pairs when a clean recipient exists", () => {
    const open = [
      conflict("g", "Grace Kim", "create_vendor", "release_payment", "critical"),
      conflict("p", "Pat Ruiz", "approve_writeoffs", "submit_claims"),
      conflict("p", "Pat Ruiz", "approve_writeoffs", "collect_cash"),
    ];
    const assignments = [
      {
        personId: "g",
        personName: "Grace Kim",
        entitlements: ["create_vendor", "release_payment"] as EntitlementId[],
      },
      {
        personId: "p",
        personName: "Pat Ruiz",
        entitlements: ["approve_writeoffs", "submit_claims", "collect_cash"] as EntitlementId[],
      },
      { personId: "r", personName: "Rosa Alvarez", entitlements: [] as EntitlementId[] },
    ];
    const split = chooseDutySplit(open, assignments, 3);
    expect(split?.personName).toBe("Pat Ruiz");
    expect(split?.duty).toBe("approve_writeoffs");
    expect(split?.closed).toHaveLength(2);
    expect(split?.recipientName).toBe("Rosa Alvarez");
    expect(split?.opened).toBe(0);
    expect(split?.net).toBe(2);
  });

  it("does not give the duty to the person who already holds the other side", () => {
    const open = [conflict("g", "Grace Kim", "create_vendor", "release_payment", "critical")];
    const assignments = [
      {
        personId: "g",
        personName: "Grace Kim",
        entitlements: ["create_vendor", "release_payment"] as EntitlementId[],
      },
      {
        personId: "s",
        personName: "Sofia Delgado",
        entitlements: ["release_payment"] as EntitlementId[],
      },
      { personId: "r", personName: "Rosa Alvarez", entitlements: [] as EntitlementId[] },
    ];
    const split = chooseDutySplit(open, assignments, 3);
    expect(split?.recipientName).toBe("Rosa Alvarez");
    expect(split?.net).toBe(1);
    expect(openedRules(["release_payment"], "create_vendor")).toBeGreaterThan(0);
  });

  it("names no recipient when the only other person would open as many conflicts as the move closes", () => {
    const open = [conflict("g", "Grace Kim", "create_vendor", "release_payment", "critical")];
    const assignments = [
      {
        personId: "g",
        personName: "Grace Kim",
        entitlements: ["create_vendor", "release_payment"] as EntitlementId[],
      },
      {
        personId: "s",
        personName: "Sofia Delgado",
        entitlements: ["release_payment"] as EntitlementId[],
      },
    ];
    const split = chooseDutySplit(open, assignments, 2);
    expect(split?.net).toBe(0);
    expect(split?.recipientName).toBeNull();
  });

  it("does not hand the recipient a second duty that conflicts with the one they just took", () => {
    const open = [
      conflict("g", "Grace Kim", "create_vendor", "release_payment", "critical"),
      conflict("s", "Sofia Delgado", "release_payment", "bank_reconcile"),
    ];
    const assignments = [
      {
        personId: "g",
        personName: "Grace Kim",
        entitlements: ["create_vendor", "release_payment"] as EntitlementId[],
      },
      {
        personId: "s",
        personName: "Sofia Delgado",
        entitlements: ["release_payment", "bank_reconcile"] as EntitlementId[],
      },
      { personId: "r", personName: "Rosa Alvarez", entitlements: [] as EntitlementId[] },
    ];
    const first = chooseDutySplit(open, assignments, 3)!;
    expect(first.recipientName).toBe("Rosa Alvarez");
    const remain = open.filter((item) => !first.closed.some((closed) => closed.id === item.id));
    const next = chooseDutySplit(remain, assignmentsAfterSplit(assignments, first), 3);
    if (next && next.recipientId === first.recipientId) {
      expect(next.opened).toBe(0);
    }
  });

  it("prefers a recipient whose duties sit in a different family when the counts match", () => {
    const open = [
      conflict("g", "Grace Kim", "create_vendor", "release_payment", "critical"),
      conflict("g", "Grace Kim", "release_payment", "bank_reconcile", "high"),
    ];
    const assignments = [
      {
        personId: "g",
        personName: "Grace Kim",
        entitlements: ["create_vendor", "release_payment", "bank_reconcile"] as EntitlementId[],
      },
      { personId: "a", personName: "Ana Cole", entitlements: ["collect_cash"] as EntitlementId[] },
      {
        personId: "r",
        personName: "Rosa Alvarez",
        entitlements: ["submit_claims"] as EntitlementId[],
      },
    ];
    const split = chooseDutySplit(open, assignments, 4);
    expect(split?.duty).toBe("release_payment");
    expect(split?.recipientName).toBe("Rosa Alvarez");
    expect(split?.opened).toBe(0);
  });

  it("keeps the best single move when a second move does not close more than that move plus its own next step", () => {
    const open = [
      conflict("g", "Grace Kim", "create_vendor", "release_payment", "critical"),
      conflict("s", "Sofia Delgado", "collect_cash", "post_payments"),
    ];
    const assignments = [
      {
        personId: "g",
        personName: "Grace Kim",
        entitlements: ["create_vendor", "release_payment"] as EntitlementId[],
      },
      {
        personId: "s",
        personName: "Sofia Delgado",
        entitlements: ["collect_cash", "post_payments"] as EntitlementId[],
      },
      { personId: "r", personName: "Rosa Alvarez", entitlements: [] as EntitlementId[] },
    ];
    const plan = chooseSplitSequence(open, assignments, 4);
    expect(plan?.pairBeatsSingle).toBe(false);
    expect(plan?.first.duty).toBe("create_vendor");
    expect(plan?.first.recipientName).toBe("Rosa Alvarez");
    expect(plan?.next?.personName).toBe("Sofia Delgado");
    expect(plan?.next?.recipientName).toBe("Rosa Alvarez");
  });
});
