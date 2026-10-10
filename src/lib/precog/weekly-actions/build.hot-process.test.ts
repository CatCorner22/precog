import { describe, expect, it } from "vitest";
import { resolveTemplate } from "@/lib/precog/active-template";
import { INDUSTRIES, type IndustryId } from "@/lib/precog/industry";
import { defaultProfile } from "@/lib/precog/practice-profile";
import { buildProcessMapGraph, type ProcessMapSnapshot } from "@/lib/precog/process-graph";
import { HEAT_BANDS } from "@/lib/precog/scoring/bands";
import {
  CONFLICT_RULES,
  entitlementLabel,
  OPERATING_DUTIES,
  type EntitlementId,
} from "@/lib/precog/sod/conflict-rules";
import { detectSodConflicts, sodDetectionOptions } from "@/lib/precog/sod/detect";
import { openFindings, partialDualReleaseCoverage } from "@/lib/precog/sod/open-findings";
import { entitlementFamily, entitlementProcesses } from "@/lib/precog/sod/rule-match";
import { chooseSplitSequence } from "@/lib/precog/sod/duty-split";
import { midSentence } from "@/lib/precog/text";
import { buildWeeklyActions, HAND_OFF_ORDER } from "./build";

/** Entries a second person only repeats: never handed off as the check. */
const ROUTINE_ENTRIES: readonly EntitlementId[] = [
  "post_payments",
  "enter_payroll",
  "enter_invoices",
  "submit_claims",
];

function actionsFor(industry: IndustryId, edit = (s: ProcessMapSnapshot[]) => s) {
  const profile = defaultProfile(industry);
  const tpl = resolveTemplate(profile);
  const { snapshots } = buildProcessMapGraph(tpl, profile.staff);
  return buildWeeklyActions({
    tpl,
    staff: profile.staff,
    dualRelease: profile.dualRelease,
    mapSnapshots: edit(snapshots),
    today: "2026-10-06",
  });
}

/** The duty the first step moves, and whose. */
function splitFor(industry: IndustryId) {
  const profile = defaultProfile(industry);
  const tpl = resolveTemplate(profile);
  const report = detectSodConflicts(
    tpl,
    profile.staff,
    sodDetectionOptions(tpl, profile.dualRelease),
  );
  const open = openFindings(
    report.conflicts,
    partialDualReleaseCoverage(profile.dualRelease, report.conflicts),
  );
  return chooseSplitSequence(open, report.assignments, profile.staff.teamSize)?.first ?? null;
}

const hotActions = (industry: IndustryId) =>
  actionsFor(industry).filter((a) => a.id.startsWith("map-heat-"));

describe("a hot process in the week's actions", () => {
  it("reads as the control its worst open conflict needs, for the person who holds it", () => {
    const cash = actionsFor("restaurant").find((a) => a.id === "map-heat-proc-cash");
    expect(cash?.title).toBe("Have someone other than Keisha approve write-offs and voids");
    expect(cash?.why).toMatch(
      /^Keisha can both prepare bank deposit and approve write-offs and voids\. /,
    );
    expect(cash?.effort).toBe("medium");
  });

  it("hands the check to someone else, not the act", () => {
    const cash = actionsFor("professional_services").find((a) => a.id === "map-heat-proc-cash");
    expect(cash?.title).toBe("Have someone other than Greg reconcile the bank account");
    expect(cash?.why).toMatch(
      /^In Operating cash & bank reconciliation, Greg can both record payments received and reconcile the bank account\. /,
    );
  });

  it("carries the duty pair, the person and the duty it hands off", () => {
    for (const { id } of INDUSTRIES) {
      for (const a of hotActions(id as IndustryId)) {
        const rule = CONFLICT_RULES.find((r) => r.id === a.ruleId);
        expect(rule, `${id}: ${a.id}`).toBeDefined();
        expect([rule!.a, rule!.b], `${id}: ${a.id}`).toContain(a.handedDuty);
        expect(a.personId, `${id}: ${a.id}`).toBeTruthy();
        expect(a.title.endsWith(midSentence(entitlementLabel(a.handedDuty!))), a.title).toBe(true);
      }
    }
  });

  it("hands off the duty the first step moves for that person", () => {
    // Dental: "moving one duty, enter write-offs" from Maya.
    expect(splitFor("dental")).toMatchObject({ personName: "Maya Chen" });
    expect(splitFor("dental")?.duty).toBe("post_adjustments");
    const claims = actionsFor("dental").find((a) => a.id === "map-heat-proc-claims");
    expect(claims?.title).toBe("Have someone other than Maya enter write-offs");
    // General: the first step's duty, not a different gap-counted duty.
    expect(splitFor("general")?.duty).toBe("release_payment");
    const ap = actionsFor("general").find((a) => a.id === "map-heat-proc-ap");
    expect(ap?.title).toBe("Have someone other than Maya release payments");
    for (const { id } of INDUSTRIES) {
      const move = splitFor(id as IndustryId);
      for (const a of hotActions(id as IndustryId)) {
        const rule = CONFLICT_RULES.find((r) => r.id === a.ruleId)!;
        if (move && a.personId === move.personId && [rule.a, rule.b].includes(move.duty)) {
          expect(a.handedDuty, `${id}: ${a.id}`).toBe(move.duty);
        }
      }
    }
  });

  it("names a process only when both duties of the pair belong to it", () => {
    // Entering payroll is not part of the restaurant's food and beverage bills.
    const bills = actionsFor("restaurant").find((a) => a.id === "map-heat-proc-ap");
    expect(bills?.why).not.toContain("Food & beverage bills");
    for (const { id } of INDUSTRIES) {
      const tpl = resolveTemplate(defaultProfile(id as IndustryId));
      for (const a of hotActions(id as IndustryId)) {
        const rule = CONFLICT_RULES.find((r) => r.id === a.ruleId)!;
        const inside = [rule.a, rule.b].every((d) =>
          entitlementProcesses(d).includes(a.processId!),
        );
        const name = tpl.processes.find((p) => p.id === a.processId)!.name;
        expect(a.why.startsWith(`In ${name}, `), `${id}: ${a.why}`).toBe(inside);
      }
    }
  });

  it("never hands off a routine entry as the check", () => {
    for (const { id } of INDUSTRIES) {
      const move = splitFor(id as IndustryId);
      for (const a of hotActions(id as IndustryId)) {
        expect(a.title, id).not.toMatch(/ (enter payroll|record payments received)$/);
        const isTheMove = move?.personId === a.personId && move?.duty === a.handedDuty;
        if (!isTheMove) {
          expect(ROUTINE_ENTRIES, `${id}: ${a.title}`).not.toContain(a.handedDuty);
        }
      }
    }
  });

  it("ranks every duty but a routine entry, checks first, so no duty drops out unnoticed", () => {
    expect(new Set(HAND_OFF_ORDER).size).toBe(HAND_OFF_ORDER.length);
    for (const duty of OPERATING_DUTIES) {
      expect(HAND_OFF_ORDER.includes(duty.id) !== ROUTINE_ENTRIES.includes(duty.id), duty.id).toBe(
        true,
      );
    }
    // Every reconciliation and review, and every approval, comes before any other duty.
    const checks = OPERATING_DUTIES.filter(
      (d) =>
        entitlementFamily(d.id) === "reconciliation" ||
        (entitlementFamily(d.id) === "authorization" && d.id.startsWith("approve_")),
    ).map((d) => d.id);
    expect(HAND_OFF_ORDER.slice(0, checks.length).sort()).toEqual([...checks].sort());
  });

  it("never prints tool words, a heat figure or the same hand-off twice, in any sample", () => {
    for (const { id } of INDUSTRIES) {
      const actions = actionsFor(id as IndustryId);
      const hot = actions.filter((a) => a.id.startsWith("map-heat-"));
      for (const a of hot) {
        expect(a.title, id).toMatch(/^Have someone other than \S+ /);
        expect(`${a.title} ${a.why}`, id).not.toMatch(/hot process|Heat \d|map builder/i);
      }
      const titles = actions.map((a) => a.title);
      expect(new Set(titles).size, id).toBe(titles.length);
    }
  });

  it("gives no action for a hot process with no open duty conflict", () => {
    const actions = actionsFor("restaurant", (snapshots) => {
      const hot = snapshots.find((s) => s.heat >= HEAT_BANDS.hot)!;
      // A hot process no duty touches: it has no conflict to name.
      return [{ ...hot, process: { ...hot.process, id: "proc-none", name: "Menu planning" } }];
    });
    expect(actions.map((a) => a.id)).not.toContain("map-heat-proc-none");
  });
});
