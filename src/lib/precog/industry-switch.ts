import { daysBetween } from "./dates";
import { resolveTemplate } from "./active-template";
import { adoptOwnTeam } from "./business-lifecycle";
import { mitigatedSodRuleIds, type DualReleasePolicy } from "./controls/dual-release";
import { deriveStaffFromTeam } from "./sod/derive-staff";
import { defaultProfile, type PracticeProfile } from "./practice-profile";
import { count, joinWithAnd, stableStringify } from "./text";

/** What a business has entered on top of its industry template — everything an industry switch discards. */
export interface EnteredWork {
  people: number;
  processes: number;
  registerItems: number;
  /** Who-holds-it marks: which person holds which register item. */
  registerEntries: number;
  absences: number;
  mapVersions: number;
  savedBlocks: number;
  /** Map nodes dragged into a chosen position. */
  pinnedPositions: number;
  /** Monthly close results recorded. */
  monthlyReviews: number;
  /** Leavers whose pay and logins the owner has still to confirm are stopped. */
  openLeaverChecks: number;
  /** A user and vendor export compared with the duty map. */
  accessReconciliation: boolean;
  /** The engagement stamps set: started, map finished, report sent. */
  engagementStamps: EngagementMilestone[];
  /** An override that exists but is empty: the team, map or register was cleared on purpose. */
  emptiedTeam: boolean;
  emptiedProcesses: boolean;
  emptiedRegister: boolean;
  /** Team sliders, risk variables or dual-release rules the owner moved by hand. */
  settings: boolean;
}

type EngagementMilestone = "started" | "finished the map" | "sent the report";

export function enteredWork(p: PracticeProfile): EnteredWork {
  const untouched = untouchedSettings(p);
  const matchesOne = <T>(value: T, candidates: T[], key: (v: T) => string = stableStringify) =>
    candidates.some((candidate) => key(candidate) === key(value));
  const dualKey = (policy: DualReleasePolicy) => stableStringify(comparableDualRelease(policy));
  const stamps = p.engagement ?? {};
  return {
    people: p.customPeople?.length ?? 0,
    processes: p.customProcesses?.length ?? 0,
    registerItems: p.customKnowledge?.length ?? 0,
    registerEntries: p.customRelations?.length ?? 0,
    absences: p.plannedAbsences?.length ?? 0,
    mapVersions: p.mapVersions?.length ?? 0,
    savedBlocks: p.savedProcessBlocks?.length ?? 0,
    pinnedPositions: Object.keys(p.mapLayout ?? {}).length,
    monthlyReviews: p.monthlyReviews?.length ?? 0,
    openLeaverChecks: (p.leaverAccessChecks ?? []).filter((check) => !check.confirmedOn).length,
    accessReconciliation: Boolean(p.accessReconciliation),
    engagementStamps: [
      ...(stamps.startedAt ? (["started"] as const) : []),
      ...(stamps.mapCompletedAt ? (["finished the map"] as const) : []),
      ...(stamps.reportSentAt ? (["sent the report"] as const) : []),
    ],
    emptiedTeam: p.customPeople !== null && p.customPeople !== undefined && !p.customPeople.length,
    emptiedProcesses:
      p.customProcesses !== null && p.customProcesses !== undefined && !p.customProcesses.length,
    emptiedRegister: emptiedRegister(p),
    settings:
      !matchesOne(
        p.staff,
        untouched.map((u) => u.staff),
      ) ||
      !matchesOne(
        p.riskVariables,
        untouched.map((u) => u.riskVariables),
      ) ||
      !matchesOne(
        p.dualRelease,
        untouched.map((u) => u.dualRelease),
        dualKey,
      ),
  };
}

export function hasEnteredWork(work: EnteredWork): boolean {
  return Object.values(work).some(
    (v) => v === true || (typeof v === "number" && v > 0) || (Array.isArray(v) && v.length > 0),
  );
}

/** Plain-language parts, most valuable first: "4 people", "12 who-holds-it marks", … */
export function describeEnteredWork(work: EnteredWork): string[] {
  const parts: string[] = [];
  if (work.people) parts.push(count(work.people, "person", "people"));
  else if (work.emptiedTeam) parts.push("a cleared team");
  if (work.registerEntries) parts.push(count(work.registerEntries, "who-holds-it mark"));
  else if (work.registerItems) parts.push(count(work.registerItems, "register item"));
  else if (work.emptiedRegister) parts.push("a cleared register");
  if (work.monthlyReviews) parts.push(count(work.monthlyReviews, "monthly close result"));
  if (work.openLeaverChecks) parts.push(count(work.openLeaverChecks, "open leaver check"));
  if (work.accessReconciliation) parts.push("an access reconciliation");
  if (work.absences) parts.push(count(work.absences, "absence"));
  if (work.processes) parts.push(count(work.processes, "process", "processes"));
  else if (work.emptiedProcesses) parts.push("a cleared process map");
  if (work.mapVersions) parts.push(count(work.mapVersions, "saved map version"));
  if (work.savedBlocks) parts.push(count(work.savedBlocks, "saved block"));
  if (work.pinnedPositions) parts.push(count(work.pinnedPositions, "pinned map position"));
  if (work.engagementStamps.length) {
    const dates = work.engagementStamps.length === 1 ? "the date" : "the dates";
    parts.push(`${dates} you ${joinWithAnd(work.engagementStamps)}`);
  }
  if (work.settings) parts.push("edited team and control settings");
  return parts;
}

/**
 * The settings this business would have if nobody had moved a slider, a
 * checkbox or a dual-release rule: the industry's defaults, and for a
 * business with its own team the figures derived from that team and the
 * approver seats read off its people. A setting that matches either is not
 * the owner's edit.
 */
function untouchedSettings(
  p: PracticeProfile,
): Pick<PracticeProfile, "staff" | "riskVariables" | "dualRelease">[] {
  const defaults = defaultProfile(p.industry);
  if (!p.customPeople) return [defaults];
  const tpl = resolveTemplate(p);
  const staff = deriveStaffFromTeam(tpl, defaults.staff, {
    dualReleaseMitigatedRuleIds: mitigatedSodRuleIds(p.dualRelease, tpl),
  });
  return [
    defaults,
    {
      staff,
      riskVariables: {
        ...defaults.riskVariables,
        hasDualControl: staff.dualControlPayments,
        hasIndependentBankRec: staff.independentBankRec,
      },
      dualRelease: adoptOwnTeam(defaults, p.customPeople).dualRelease,
    },
  ];
}

/**
 * True when the register was cleared on purpose. An own team that took over
 * the sample keeps the sample's items with nobody marked yet (adoptOwnTeam);
 * that is where setup left it, not something the owner cleared.
 */
function emptiedRegister(p: PracticeProfile): boolean {
  const knowledge = p.customKnowledge ?? null;
  const relations = p.customRelations ?? null;
  if (knowledge === null && relations === null) return false;
  if (p.customPeople && knowledge === null) return false;
  return !knowledge?.length && !relations?.length;
}

/**
 * The policy with the seed's day-of-creation stamps neutralised: `updatedAt`
 * and each exception's `createdAt` are dropped, and its effective window is
 * kept as day offsets from `createdAt` rather than dates. A business created
 * yesterday still matches today's defaults when nothing was changed, while
 * moving an exception's window (which changes the offsets) still counts as an
 * edit.
 */
function comparableDualRelease(policy: DualReleasePolicy) {
  const { updatedAt: _updatedAt, exceptions, ...rest } = policy;
  return {
    ...rest,
    exceptions: exceptions.map(({ createdAt, effectiveFrom, effectiveTo, ...exception }) => ({
      ...exception,
      effectiveFromOffset: dayOffset(createdAt, effectiveFrom),
      effectiveToOffset: dayOffset(createdAt, effectiveTo),
    })),
  };
}

function dayOffset(from: string, to: string | undefined): number | string | null {
  if (!to) return null;
  return daysBetween(from, to) ?? to;
}
