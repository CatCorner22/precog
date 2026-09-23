/**
 * Dual-release controls for small dental practices.
 * Enforces two distinct people (or owner override) above thresholds
 * for ACH, checks, write-offs, vendor master, deposits, payroll.
 *
 * Threshold exceptions: payee, person, role, channel, amount-band,
 * time-bound raise / force-dual / waive (with residual logging).
 *
 * Educational control design — not bank/PMS integration.
 */
import type { Person, StaffComposition } from "../types";
import type { IndustryTemplate } from "../templates";
import { getIndustryCopy } from "../templates/industry-copy";
import type { EntitlementId } from "../sod/conflict-rules";
import { isOwnerRole, ownersMarked, ownsBusiness } from "../sod/owner-role";

export type ReleaseChannel = "ach" | "check" | "writeoff" | "vendor_new" | "deposit" | "payroll";

export type ExceptionAction =
  /** Raise the dual-required threshold (single release allowed up to higher amount) */
  | "raise_threshold"
  /** Force dual release even below normal threshold */
  | "force_dual"
  /** Waive dual requirement entirely (still logs residual risk) */
  | "waive_dual"
  /** Cap / lower threshold (stricter than base) */
  | "lower_threshold";

export type ExceptionScope = "payee" | "person" | "role" | "channel" | "amount_band";

export interface ThresholdException {
  id: string;
  label: string;
  /** Channels this exception applies to; empty = all */
  channels: ReleaseChannel[];
  action: ExceptionAction;
  /** For raise/lower: absolute threshold override (USD) */
  thresholdUsd?: number;
  /** Scope matchers (all provided must match) */
  payeeContains?: string;
  personId?: string;
  role?: string;
  /** Amount band: match when request amount is within [min, max] */
  amountMinUsd?: number;
  amountMaxUsd?: number;
  /** ISO date YYYY-MM-DD inclusive */
  effectiveFrom?: string;
  effectiveTo?: string;
  enabled: boolean;
  reason: string;
  approvedByPersonId?: string;
  createdAt: string;
  /** Residual risk note when waive/raise is used */
  residualNote?: string;
  /** Seeded with the demo, not entered by the owner; shown with a "Sample" badge. */
  sample?: boolean;
}

export interface DualReleaseRule {
  channel: ReleaseChannel;
  label: string;
  enabled: boolean;
  /** Dual release required for amounts strictly greater than this (USD). 0 = always. */
  thresholdUsd: number;
  requireDistinctPeople: boolean;
  firstApproverRoles: string[];
  secondApproverRoles: string[];
  mitigatesRuleIds: string[];
  processIds: string[];
  description: string;
}

export interface DualReleasePolicy {
  enabled: boolean;
  ownerCanSecondAny: boolean;
  hardBlockWithoutSecond: boolean;
  rules: DualReleaseRule[];
  /** Ordered by specificity; first matching active exception wins */
  exceptions: ThresholdException[];
  updatedAt?: string;
}

export interface ReleaseRequest {
  channel: ReleaseChannel;
  amountUsd: number;
  initiatorPersonId: string;
  secondPersonId?: string;
  memo?: string;
  payee?: string;
  /** Evaluation as-of date (ISO date); defaults to today */
  asOfDate?: string;
}

export type ReleaseStatus =
  | "below_threshold"
  | "needs_second"
  | "approved_dual"
  | "approved_single"
  | "approved_exception"
  | "blocked_same_person"
  | "blocked_role"
  | "blocked_missing_second"
  | "blocked_policy_off";

export interface EligibleApprover {
  id: string;
  name: string;
  role: string;
  canInitiate: boolean;
  canSecond: boolean;
}

export interface AppliedException {
  id: string;
  label: string;
  action: ExceptionAction;
  baseThresholdUsd: number;
  effectiveThresholdUsd: number;
  residualNote?: string;
}

export interface ReleaseEvaluation {
  status: ReleaseStatus;
  ok: boolean;
  channel: ReleaseChannel;
  amountUsd: number;
  /**
   * The dollar threshold in force for this evaluation, always finite.
   *
   * A waived rule used to pass Number.POSITIVE_INFINITY through here, and a
   * forced rule -1. Consumers then had to reverse-engineer the exception state
   * from a sentinel, and the panel got it wrong: it rendered a waiver — the
   * weakest possible state, no second signer at any amount — as "$0", which
   * everywhere else in the product means "always dual", the strictest state.
   * The two flags below carry that state explicitly so no display ever has to
   * infer it from a number.
   */
  thresholdUsd: number;
  baseThresholdUsd: number;
  dualRequired: boolean;
  /** True when an exception waived dual release: one person may act alone at any amount. */
  dualWaived: boolean;
  /** True when an exception forces dual release at every amount. */
  dualForced: boolean;
  reasons: string[];
  nextSteps: string[];
  eligibleSeconds: EligibleApprover[];
  initiator?: { id: string; name: string; role: string };
  second?: { id: string; name: string; role: string };
  mitigatesRules: string[];
  appliedException?: AppliedException;
  controlCredit: {
    dualControlPayments: boolean;
    /**
     * The configured control as a carrier would see it: dual release on with no
     * waiver in force. Not an eligibility determination — whether any credit
     * exists depends on the carrier and the policy's control warranties.
     */
    evidenceReady: boolean;
    note: string;
  };
}

export interface DualReleaseCoverage {
  channel: ReleaseChannel;
  label: string;
  enabled: boolean;
  thresholdUsd: number;
  mitigatesRuleIds: string[];
  covered: boolean;
  activeExceptions: number;
}

export const DEFAULT_DUAL_RELEASE_RULES: DualReleaseRule[] = [
  {
    channel: "ach",
    label: "ACH / vendor electronic pay",
    enabled: true,
    thresholdUsd: 500,
    requireDistinctPeople: true,
    firstApproverRoles: ["Office Manager", "Billing Specialist", "Owner / Dentist"],
    secondApproverRoles: ["Owner / Dentist", "Office Manager"],
    mitigatesRuleIds: ["rule-vendor-create-pay", "rule-vendor-approve-pay"],
    processIds: ["proc-ap"],
    description: "Second person releases ACH above threshold — blocks fictitious vendor pay alone.",
  },
  {
    channel: "check",
    label: "Paper checks",
    enabled: true,
    thresholdUsd: 500,
    requireDistinctPeople: true,
    firstApproverRoles: ["Office Manager", "Owner / Dentist"],
    secondApproverRoles: ["Owner / Dentist"],
    mitigatesRuleIds: ["rule-vendor-create-pay"],
    processIds: ["proc-ap"],
    description: "Dual signature on checks above threshold.",
  },
  {
    channel: "writeoff",
    label: "Write-offs / adjustments",
    enabled: true,
    thresholdUsd: 150,
    requireDistinctPeople: true,
    firstApproverRoles: ["Billing Specialist", "Office Manager", "Front Desk Lead"],
    secondApproverRoles: ["Owner / Dentist", "Office Manager"],
    mitigatesRuleIds: ["rule-writeoff", "rule-claims-writeoff"],
    processIds: ["proc-ar", "proc-claims"],
    description: "Owner/OM must approve adjustments above threshold.",
  },
  {
    channel: "vendor_new",
    label: "New vendor master",
    enabled: true,
    thresholdUsd: 0,
    requireDistinctPeople: true,
    firstApproverRoles: ["Office Manager", "Billing Specialist"],
    secondApproverRoles: ["Owner / Dentist"],
    mitigatesRuleIds: ["rule-vendor-create-approve", "rule-vendor-create-pay"],
    processIds: ["proc-ap"],
    description: "Owner signs every new vendor before first payment.",
  },
  {
    channel: "deposit",
    label: "Bank deposit bag",
    enabled: true,
    thresholdUsd: 0,
    requireDistinctPeople: true,
    firstApproverRoles: ["Front Desk Lead", "Office Manager"],
    secondApproverRoles: ["Office Manager", "Owner / Dentist", "Billing Specialist"],
    // A second counter checks the bag against the deposit slip. That narrows
    // the person who prepares the deposit and posts it; it does not stop a
    // cashier recording less than was taken, or a poster who reconciles
    // adjusting the books, so collect + post and post + reconcile stay open.
    mitigatesRuleIds: ["rule-deposit-post"],
    processIds: ["proc-cash"],
    description: "Dual count of deposit before bag is sealed.",
  },
  {
    channel: "payroll",
    label: "Payroll transmission",
    enabled: true,
    thresholdUsd: 0,
    requireDistinctPeople: true,
    firstApproverRoles: ["Office Manager"],
    secondApproverRoles: ["Owner / Dentist"],
    mitigatesRuleIds: ["rule-payroll"],
    processIds: ["proc-payroll"],
    description: "Owner approves final payroll file every cycle.",
  },
];

/**
 * Who may start a release on each channel, and who may second it, read from
 * the duties a person holds. People who carry their own duty list (the
 * owner's own team) are seated by these; people without one (the sample
 * teams) by the rule's role lists. The owner may also second any channel
 * when the policy allows it.
 */
const CHANNEL_SEATS: Record<
  ReleaseChannel,
  { initiate: readonly EntitlementId[]; second: readonly EntitlementId[] }
> = {
  ach: {
    initiate: ["initiate_ach", "release_payment"],
    second: ["release_payment", "initiate_ach", "sign_checks"],
  },
  check: {
    initiate: ["sign_checks", "release_payment"],
    second: ["sign_checks", "release_payment"],
  },
  writeoff: { initiate: ["post_adjustments", "approve_writeoffs"], second: ["approve_writeoffs"] },
  vendor_new: { initiate: ["create_vendor"], second: ["approve_vendor"] },
  deposit: {
    initiate: ["prepare_deposit", "collect_cash"],
    second: ["prepare_deposit", "collect_cash", "post_payments", "bank_reconcile"],
  },
  payroll: { initiate: ["enter_payroll"], second: ["approve_payroll"] },
};

function holdsAny(person: Person, duties: readonly EntitlementId[]): boolean {
  const held = person.entitlements ?? [];
  return duties.some((d) => held.includes(d));
}

/** True when the person carries a duty list of their own, so seats come from duties rather than titles. */
function seatedByDuty(person: Person): boolean {
  return (person.entitlements?.length ?? 0) > 0;
}

const DENTAL_ROLE_SLOTS: Record<string, (role: string) => boolean> = {
  "Owner / Dentist": isOwnerRole,
  "Office Manager": (role) => /manager|general manager/i.test(role),
  "Front Desk Lead": (role) => /front desk|cashier|lead cashier|host|shift lead/i.test(role),
  "Billing Specialist": (role) => /billing|bookkeeper|accounting|controller|specialist/i.test(role),
};

function rolesForSlot(people: Person[], matches: (role: string) => boolean): string[] {
  return people.filter((p) => matches(p.role)).map((p) => p.role);
}

function localizeDualReleaseRules(
  tpl: IndustryTemplate,
  rules: DualReleaseRule[],
): DualReleaseRule[] {
  const processIds = new Set(tpl.processes.map((p) => p.id));
  const active = tpl.people.filter((p) => p.active);
  // A team that says what each person does is seated by duty on every channel.
  if (active.length > 0 && active.every(seatedByDuty)) {
    const roles = (list: Person[]) => [...new Set(list.map((p) => p.role))];
    const marked = ownersMarked(active);
    return rules.map((rule) => {
      const seats = CHANNEL_SEATS[rule.channel];
      return {
        ...rule,
        firstApproverRoles: roles(active.filter((p) => holdsAny(p, seats.initiate))),
        secondApproverRoles: roles(
          active.filter((p) => holdsAny(p, seats.second) || ownsBusiness(p, marked)),
        ),
        processIds: rule.processIds.filter((id) => processIds.has(id)),
      };
    });
  }
  const slotMap = new Map<string, string[]>();
  for (const [slot, matches] of Object.entries(DENTAL_ROLE_SLOTS)) {
    slotMap.set(slot, rolesForSlot(tpl.people, matches));
  }

  const mapRoles = (roles: string[]) => {
    const out: string[] = [];
    for (const role of roles) {
      const resolved = slotMap.get(role);
      if (resolved?.length) out.push(...resolved);
      else if (tpl.people.some((p) => p.role === role)) out.push(role);
    }
    return [...new Set(out.length ? out : tpl.people.slice(0, 1).map((p) => p.role))];
  };

  return rules.map((rule) => ({
    ...rule,
    firstApproverRoles: mapRoles(rule.firstApproverRoles),
    secondApproverRoles: mapRoles(rule.secondApproverRoles),
    processIds: rule.processIds.filter((id) => processIds.has(id)),
  }));
}

/** Demo seed exceptions (owner-approved recurring vendor payee + optional strict mode). */
export function defaultExceptions(tpl: IndustryTemplate): ThresholdException[] {
  const copy = getIndustryCopy(tpl.id);
  const today = new Date();
  const in90 = new Date(today.getTime() + 90 * 86400000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return [
    {
      id: "ex-vendor-recurring",
      sample: true,
      label: copy.dualReleaseSeed.exceptionLabel,
      channels: ["ach"],
      action: "raise_threshold",
      thresholdUsd: 3500,
      payeeContains: copy.dualReleaseSeed.exceptionPayeeContains,
      enabled: true,
      reason: "Recurring vendor with monthly invoice; owner reviewed 12 months clean history.",
      approvedByPersonId: "p1",
      createdAt: iso(today),
      residualNote: `Single release up to $3,500 for ${copy.dualReleaseSeed.defaultPayee} only — sample monthly statements.`,
    },
    {
      id: "ex-force-new-vendor-pay",
      label: "Force dual on any first ACH to new payee band",
      channels: ["ach"],
      action: "force_dual",
      amountMinUsd: 1,
      amountMaxUsd: 499,
      enabled: false,
      reason: "Optional strict mode: dual even under the threshold for small first payments.",
      createdAt: iso(today),
    },
    {
      id: "ex-temp-om-writeoff",
      sample: true,
      label: "Temp OM write-off raise (vacation cover)",
      channels: ["writeoff"],
      action: "raise_threshold",
      thresholdUsd: 400,
      personId: "p2",
      effectiveFrom: iso(today),
      effectiveTo: iso(in90),
      enabled: false,
      reason: "Owner out of office — temporary higher single-approval for OM.",
      approvedByPersonId: "p1",
      createdAt: iso(today),
      residualNote: "Time-bound; auto-expires. Review all write-offs on return.",
    },
  ];
}

export function defaultDualReleasePolicy(
  tpl: IndustryTemplate,
  staff?: StaffComposition,
): DualReleasePolicy {
  const enabled = staff?.dualControlPayments ?? false;
  return {
    enabled,
    ownerCanSecondAny: true,
    hardBlockWithoutSecond: true,
    rules: localizeDualReleaseRules(
      tpl,
      DEFAULT_DUAL_RELEASE_RULES.map((r) => ({ ...r })),
    ),
    exceptions: defaultExceptions(tpl),
  };
}

export function makeExceptionId(): string {
  return `ex_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

const RELEASE_CHANNELS = new Set<ReleaseChannel>([
  "ach",
  "check",
  "writeoff",
  "vendor_new",
  "deposit",
  "payroll",
]);
const EXCEPTION_ACTIONS = new Set<ExceptionAction>([
  "raise_threshold",
  "force_dual",
  "waive_dual",
  "lower_threshold",
]);
const MAX_USD = 1_000_000_000;

const str = (value: unknown, max: number): string | undefined =>
  typeof value === "string" ? value.trim().slice(0, max) : undefined;
const usd = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(MAX_USD, value))
    : undefined;
const isoDay = (value: unknown): string | undefined =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
const roleList = (value: unknown, fallback: string[]): string[] =>
  Array.isArray(value)
    ? value
        .filter((r): r is string => typeof r === "string")
        .map((r) => r.trim().slice(0, 60))
        .filter(Boolean)
        .slice(0, 20)
    : fallback;

/**
 * Reads one stored or imported exception, keeping only fields of the right
 * shape. Returns null when the record cannot be an exception at all (no id,
 * unknown action), so a corrupt or crafted snapshot never reaches the
 * evaluator with, say, `channels: null`.
 */
export function normalizeThresholdException(value: unknown): ThresholdException | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const id = str(v.id, 80);
  const action = v.action as ExceptionAction;
  if (!id || !EXCEPTION_ACTIONS.has(action)) return null;
  const channels = Array.isArray(v.channels)
    ? v.channels.filter((c): c is ReleaseChannel => RELEASE_CHANNELS.has(c as ReleaseChannel))
    : [];
  const out: ThresholdException = {
    id,
    label: str(v.label, 120) ?? "",
    channels,
    action,
    enabled: v.enabled === true,
    reason: str(v.reason, 400) ?? "",
    createdAt: str(v.createdAt, 40) ?? new Date().toISOString(),
  };
  const thresholdUsd = usd(v.thresholdUsd);
  if (thresholdUsd !== undefined) out.thresholdUsd = thresholdUsd;
  const amountMinUsd = usd(v.amountMinUsd);
  if (amountMinUsd !== undefined) out.amountMinUsd = amountMinUsd;
  const amountMaxUsd = usd(v.amountMaxUsd);
  if (amountMaxUsd !== undefined) out.amountMaxUsd = amountMaxUsd;
  for (const key of [
    "payeeContains",
    "personId",
    "role",
    "approvedByPersonId",
    "residualNote",
  ] as const) {
    const text = str(v[key], key === "residualNote" ? 400 : 120);
    if (text) out[key] = text;
  }
  const from = isoDay(v.effectiveFrom);
  if (from) out.effectiveFrom = from;
  const to = isoDay(v.effectiveTo);
  if (to) out.effectiveTo = to;
  if (v.sample === true) out.sample = true;
  return out;
}

/** Applies a stored rule override onto the template's rule, field by field, ignoring anything malformed. */
function mergeRule(base: DualReleaseRule, override: unknown): DualReleaseRule {
  if (!override || typeof override !== "object") return base;
  const o = override as Record<string, unknown>;
  return {
    ...base,
    label: str(o.label, 120) || base.label,
    description: str(o.description, 400) ?? base.description,
    enabled: typeof o.enabled === "boolean" ? o.enabled : base.enabled,
    thresholdUsd: usd(o.thresholdUsd) ?? base.thresholdUsd,
    requireDistinctPeople:
      typeof o.requireDistinctPeople === "boolean"
        ? o.requireDistinctPeople
        : base.requireDistinctPeople,
    firstApproverRoles: roleList(o.firstApproverRoles, base.firstApproverRoles),
    secondApproverRoles: roleList(o.secondApproverRoles, base.secondApproverRoles),
    // Which conflicts a channel mitigates and which processes it touches come from the template, never from stored data.
    mitigatesRuleIds: base.mitigatesRuleIds,
    processIds: base.processIds,
    channel: base.channel,
  };
}

export function mergeDualReleasePolicy(
  tpl: IndustryTemplate,
  partial?: Partial<DualReleasePolicy> | null,
  staff?: StaffComposition,
): DualReleasePolicy {
  const base = defaultDualReleasePolicy(tpl, staff);
  if (!partial || typeof partial !== "object") return base;
  const rulesByChannel = new Map<string, unknown>();
  if (Array.isArray(partial.rules)) {
    for (const r of partial.rules as unknown[]) {
      if (r && typeof r === "object" && typeof (r as { channel?: unknown }).channel === "string") {
        rulesByChannel.set((r as { channel: string }).channel, r);
      }
    }
  }
  const exceptions = Array.isArray(partial.exceptions)
    ? (partial.exceptions as unknown[])
        .slice(0, 200)
        .map(normalizeThresholdException)
        .filter((e): e is ThresholdException => e !== null)
    : base.exceptions;
  return {
    enabled: typeof partial.enabled === "boolean" ? partial.enabled : base.enabled,
    ownerCanSecondAny:
      typeof partial.ownerCanSecondAny === "boolean"
        ? partial.ownerCanSecondAny
        : base.ownerCanSecondAny,
    hardBlockWithoutSecond:
      typeof partial.hardBlockWithoutSecond === "boolean"
        ? partial.hardBlockWithoutSecond
        : base.hardBlockWithoutSecond,
    rules: base.rules.map((r) => mergeRule(r, rulesByChannel.get(r.channel))),
    exceptions,
    updatedAt: typeof partial.updatedAt === "string" ? partial.updatedAt : undefined,
  };
}

function personById(tpl: IndustryTemplate, id: string) {
  return tpl.people.find((p) => p.id === id);
}

function todayIso(asOf?: string) {
  return asOf ?? new Date().toISOString().slice(0, 10);
}

function isDateActive(ex: ThresholdException, asOf: string): boolean {
  if (ex.effectiveFrom && asOf < ex.effectiveFrom) return false;
  if (ex.effectiveTo && asOf > ex.effectiveTo) return false;
  return true;
}

/** Specificity score — higher wins when multiple match (we take first sorted). */
function exceptionSpecificity(ex: ThresholdException): number {
  let s = 0;
  if (ex.payeeContains) s += 40;
  if (ex.personId) s += 30;
  if (ex.role) s += 20;
  if (ex.amountMinUsd != null || ex.amountMaxUsd != null) s += 15;
  if (ex.channels.length === 1) s += 10;
  if (ex.effectiveFrom || ex.effectiveTo) s += 5;
  return s;
}

export function matchExceptions(
  tpl: IndustryTemplate,
  policy: DualReleasePolicy,
  request: Pick<
    ReleaseRequest,
    "channel" | "amountUsd" | "initiatorPersonId" | "payee" | "asOfDate"
  >,
): ThresholdException[] {
  const asOf = todayIso(request.asOfDate);
  const initiator = personById(tpl, request.initiatorPersonId);
  const payee = (request.payee ?? "").toLowerCase();

  const matched = (policy.exceptions ?? []).filter((ex) => {
    if (!ex.enabled) return false;
    if (!isDateActive(ex, asOf)) return false;
    if (ex.channels.length > 0 && !ex.channels.includes(request.channel)) {
      return false;
    }
    if (ex.payeeContains) {
      if (!payee.includes(ex.payeeContains.toLowerCase())) return false;
    }
    if (ex.personId && ex.personId !== request.initiatorPersonId) return false;
    if (ex.role && initiator?.role !== ex.role) return false;
    if (ex.amountMinUsd != null && request.amountUsd < ex.amountMinUsd) {
      return false;
    }
    if (ex.amountMaxUsd != null && request.amountUsd > ex.amountMaxUsd) {
      return false;
    }
    return true;
  });

  return matched.sort((a, b) => exceptionSpecificity(b) - exceptionSpecificity(a));
}

export function resolveEffectiveThreshold(
  baseThresholdUsd: number,
  exception: ThresholdException | undefined,
): {
  thresholdUsd: number;
  forceDual: boolean;
  waiveDual: boolean;
  applied?: AppliedException;
} {
  if (!exception) {
    return { thresholdUsd: baseThresholdUsd, forceDual: false, waiveDual: false };
  }

  if (exception.action === "waive_dual") {
    return {
      thresholdUsd: Number.POSITIVE_INFINITY,
      forceDual: false,
      waiveDual: true,
      applied: {
        id: exception.id,
        label: exception.label,
        action: exception.action,
        baseThresholdUsd,
        effectiveThresholdUsd: Number.POSITIVE_INFINITY,
        residualNote: exception.residualNote ?? exception.reason,
      },
    };
  }

  if (exception.action === "force_dual") {
    return {
      thresholdUsd: -1, // dual for any amount > -1
      forceDual: true,
      waiveDual: false,
      applied: {
        id: exception.id,
        label: exception.label,
        action: exception.action,
        baseThresholdUsd,
        effectiveThresholdUsd: -1,
        residualNote: exception.residualNote,
      },
    };
  }

  const override = exception.thresholdUsd != null ? exception.thresholdUsd : baseThresholdUsd;

  const thresholdUsd =
    exception.action === "raise_threshold"
      ? Math.max(baseThresholdUsd, override)
      : Math.min(baseThresholdUsd, override); // lower_threshold

  return {
    thresholdUsd,
    forceDual: false,
    waiveDual: false,
    applied: {
      id: exception.id,
      label: exception.label,
      action: exception.action,
      baseThresholdUsd,
      effectiveThresholdUsd: thresholdUsd,
      residualNote: exception.residualNote ?? exception.reason,
    },
  };
}

export function listEligibleApprovers(
  tpl: IndustryTemplate,
  policy: DualReleasePolicy,
  channel: ReleaseChannel,
): EligibleApprover[] {
  const rule = policy.rules.find((r) => r.channel === channel);
  if (!rule) return [];

  const { people } = tpl;
  const marked = ownersMarked(people.filter((p) => p.active));
  return people
    .filter((p) => p.active)
    .map((p) => {
      const isOwner = ownsBusiness(p, marked);
      const seats = CHANNEL_SEATS[channel];
      const byDuty = seatedByDuty(p);
      const canInitiate = byDuty
        ? holdsAny(p, seats.initiate)
        : rule.firstApproverRoles.includes(p.role);
      const canSecond =
        (byDuty ? holdsAny(p, seats.second) : rule.secondApproverRoles.includes(p.role)) ||
        (policy.ownerCanSecondAny && isOwner);
      return {
        id: p.id,
        name: p.name,
        role: p.role,
        canInitiate,
        canSecond,
      };
    })
    .filter((p) => p.canInitiate || p.canSecond);
}

/** "Ana Ruiz (Owner), Grace Kim (Bookkeeper)", or a plain statement when nobody qualifies. */
function peopleList(people: readonly EligibleApprover[], joiner = ", "): string {
  if (people.length === 0) return "nobody on the team holds a duty that allows it";
  return people.map((p) => `${p.name} (${p.role})`).join(joiner);
}

/**
 * The threshold a consumer should display: a real dollar figure, never a
 * sentinel. Waived (+Infinity) reports the base so the reader sees what was
 * waived; forced (-1) reports 0, which is the true effective threshold.
 */
function displayThreshold(effective: number, base: number): number {
  if (!Number.isFinite(effective)) return base;
  return Math.max(0, effective);
}

export function evaluateRelease(
  tpl: IndustryTemplate,
  policy: DualReleasePolicy,
  request: ReleaseRequest,
): ReleaseEvaluation {
  const rule = policy.rules.find((r) => r.channel === request.channel);
  const initiator = personById(tpl, request.initiatorPersonId);
  const second = request.secondPersonId ? personById(tpl, request.secondPersonId) : undefined;

  const baseCredit = {
    dualControlPayments: policy.enabled,
    evidenceReady:
      policy.enabled &&
      !(policy.exceptions ?? []).some((e) => e.enabled && e.action === "waive_dual"),
    note: policy.enabled
      ? "Dual-release policy active. Whether a carrier gives a credit for it depends on your policy's control warranties; this tool does not determine eligibility."
      : "Policy off — there is no dual-control configuration to show a carrier.",
  };

  if (!policy.enabled) {
    return {
      status: "blocked_policy_off",
      ok: false,
      channel: request.channel,
      amountUsd: request.amountUsd,
      thresholdUsd: rule?.thresholdUsd ?? 0,
      baseThresholdUsd: rule?.thresholdUsd ?? 0,
      dualWaived: false,
      dualForced: false,
      dualRequired: false,
      reasons: ["Dual-release policy is turned off for the practice."],
      nextSteps: ["Enable dual release in Controls, then configure channel thresholds."],
      eligibleSeconds: [],
      initiator: initiator
        ? { id: initiator.id, name: initiator.name, role: initiator.role }
        : undefined,
      second: second ? { id: second.id, name: second.name, role: second.role } : undefined,
      mitigatesRules: [],
      controlCredit: baseCredit,
    };
  }

  if (!rule || !rule.enabled) {
    return {
      status: "blocked_policy_off",
      ok: false,
      channel: request.channel,
      amountUsd: request.amountUsd,
      thresholdUsd: 0,
      baseThresholdUsd: 0,
      dualWaived: false,
      dualForced: false,
      dualRequired: false,
      reasons: [`No active dual-release rule for channel "${request.channel}".`],
      nextSteps: ["Enable this channel in the dual-release policy."],
      eligibleSeconds: listEligibleApprovers(tpl, policy, request.channel).filter(
        (p) => p.canSecond,
      ),
      initiator: initiator
        ? { id: initiator.id, name: initiator.name, role: initiator.role }
        : undefined,
      mitigatesRules: rule?.mitigatesRuleIds ?? [],
      controlCredit: baseCredit,
    };
  }

  const matches = matchExceptions(tpl, policy, request);
  const topEx = matches[0];
  const resolved = resolveEffectiveThreshold(rule.thresholdUsd, topEx);
  const effectiveThreshold = resolved.thresholdUsd;
  const dualRequired = resolved.forceDual
    ? true
    : resolved.waiveDual
      ? false
      : request.amountUsd > effectiveThreshold;

  const eligible = listEligibleApprovers(tpl, policy, request.channel);
  const eligibleSeconds = eligible.filter((p) => p.canSecond);

  const initiatorMeta = initiator
    ? { id: initiator.id, name: initiator.name, role: initiator.role }
    : undefined;
  const secondMeta = second ? { id: second.id, name: second.name, role: second.role } : undefined;

  if (!initiator) {
    return {
      status: "blocked_role",
      ok: false,
      channel: request.channel,
      amountUsd: request.amountUsd,
      thresholdUsd: displayThreshold(effectiveThreshold, rule.thresholdUsd),
      baseThresholdUsd: rule.thresholdUsd,
      dualWaived: resolved.waiveDual,
      dualForced: resolved.forceDual,
      dualRequired,
      reasons: ["Initiator not found."],
      nextSteps: ["Pick a valid staff member as first signer."],
      eligibleSeconds,
      mitigatesRules: rule.mitigatesRuleIds,
      appliedException: resolved.applied,
      controlCredit: baseCredit,
    };
  }

  const initiatorEligible = eligible.find((p) => p.id === initiator.id);
  if (!initiatorEligible?.canInitiate) {
    return {
      status: "blocked_role",
      ok: false,
      channel: request.channel,
      amountUsd: request.amountUsd,
      thresholdUsd: displayThreshold(effectiveThreshold, rule.thresholdUsd),
      baseThresholdUsd: rule.thresholdUsd,
      dualWaived: resolved.waiveDual,
      dualForced: resolved.forceDual,
      dualRequired,
      reasons: [`${initiator.name} (${initiator.role}) is not allowed to initiate ${rule.label}.`],
      nextSteps: [`Initiators must be: ${peopleList(eligible.filter((p) => p.canInitiate))}.`],
      eligibleSeconds,
      initiator: initiatorMeta,
      mitigatesRules: rule.mitigatesRuleIds,
      appliedException: resolved.applied,
      controlCredit: baseCredit,
    };
  }

  // Waived dual via exception
  if (resolved.waiveDual) {
    return {
      status: "approved_exception",
      ok: true,
      channel: request.channel,
      amountUsd: request.amountUsd,
      thresholdUsd: displayThreshold(effectiveThreshold, rule.thresholdUsd),
      baseThresholdUsd: rule.thresholdUsd,
      dualWaived: resolved.waiveDual,
      dualForced: resolved.forceDual,
      dualRequired: false,
      reasons: [
        `Exception "${topEx!.label}" waives dual release for this request.`,
        topEx!.residualNote ?? topEx!.reason,
      ],
      nextSteps: [
        "Log residual acceptance in the decision journal.",
        "Re-review exception before expiry.",
      ],
      eligibleSeconds,
      initiator: initiatorMeta,
      second: secondMeta,
      mitigatesRules: rule.mitigatesRuleIds,
      appliedException: resolved.applied,
      controlCredit: {
        ...baseCredit,
        evidenceReady: false,
        note: "An active dual-waive exception weakens the control a carrier would look at — disclose it if asked.",
      },
    };
  }

  if (!dualRequired) {
    const viaRaise = resolved.applied && resolved.applied.action === "raise_threshold";
    return {
      status: viaRaise ? "approved_exception" : "below_threshold",
      ok: true,
      channel: request.channel,
      amountUsd: request.amountUsd,
      thresholdUsd:
        effectiveThreshold === Number.POSITIVE_INFINITY
          ? rule.thresholdUsd
          : effectiveThreshold < 0
            ? 0
            : effectiveThreshold,
      baseThresholdUsd: rule.thresholdUsd,
      dualWaived: resolved.waiveDual,
      dualForced: resolved.forceDual,
      dualRequired: false,
      reasons: [
        viaRaise
          ? `Exception "${resolved.applied!.label}" raised threshold from $${rule.thresholdUsd.toLocaleString()} to $${resolved.applied!.effectiveThresholdUsd.toLocaleString()}.`
          : `Amount $${request.amountUsd.toLocaleString()} is at or under threshold $${effectiveThreshold.toLocaleString()} — single release allowed.`,
        ...(resolved.applied?.residualNote ? [resolved.applied.residualNote] : []),
      ],
      nextSteps: [
        "Still log the release; spot-check samples monthly.",
        ...(viaRaise ? ["Confirm exception still valid (dates / payee)."] : []),
      ],
      eligibleSeconds,
      initiator: initiatorMeta,
      mitigatesRules: rule.mitigatesRuleIds,
      appliedException: resolved.applied,
      controlCredit: baseCredit,
    };
  }

  // Dual required path
  if (!second) {
    return {
      status: policy.hardBlockWithoutSecond ? "blocked_missing_second" : "needs_second",
      ok: !policy.hardBlockWithoutSecond,
      channel: request.channel,
      amountUsd: request.amountUsd,
      thresholdUsd: effectiveThreshold < 0 ? 0 : Math.max(0, effectiveThreshold),
      baseThresholdUsd: rule.thresholdUsd,
      dualWaived: resolved.waiveDual,
      dualForced: resolved.forceDual,
      dualRequired: true,
      reasons: [
        resolved.forceDual
          ? `Exception "${topEx!.label}" forces dual release.`
          : `Dual release required above $${Math.max(0, effectiveThreshold).toLocaleString()}.`,
        "Second signer not yet attached.",
        ...(resolved.applied && resolved.applied.baseThresholdUsd !== effectiveThreshold
          ? [
              `Base threshold $${rule.thresholdUsd.toLocaleString()} → effective $${Math.max(0, effectiveThreshold).toLocaleString()}.`,
            ]
          : []),
      ],
      nextSteps: [
        `Select second signer: ${peopleList(
          eligibleSeconds.filter((p) => p.id !== initiator.id),
          " or ",
        )}.`,
        policy.ownerCanSecondAny
          ? "Owner may second any channel."
          : "Owner seconding only if listed in rule.",
      ],
      eligibleSeconds: eligibleSeconds.filter((p) => p.id !== initiator.id),
      initiator: initiatorMeta,
      mitigatesRules: rule.mitigatesRuleIds,
      appliedException: resolved.applied,
      controlCredit: baseCredit,
    };
  }

  if (rule.requireDistinctPeople && second.id === initiator.id) {
    return {
      status: "blocked_same_person",
      ok: false,
      channel: request.channel,
      amountUsd: request.amountUsd,
      thresholdUsd: Math.max(0, effectiveThreshold),
      baseThresholdUsd: rule.thresholdUsd,
      dualWaived: resolved.waiveDual,
      dualForced: resolved.forceDual,
      dualRequired: true,
      reasons: [
        "Same person cannot be first and second signer — dual release requires two distinct people.",
      ],
      nextSteps: ["Pick a different second signer."],
      eligibleSeconds: eligibleSeconds.filter((p) => p.id !== initiator.id),
      initiator: initiatorMeta,
      second: secondMeta,
      mitigatesRules: rule.mitigatesRuleIds,
      appliedException: resolved.applied,
      controlCredit: baseCredit,
    };
  }

  const secondEligible = eligibleSeconds.find((p) => p.id === second.id);
  if (!secondEligible) {
    return {
      status: "blocked_role",
      ok: false,
      channel: request.channel,
      amountUsd: request.amountUsd,
      thresholdUsd: Math.max(0, effectiveThreshold),
      baseThresholdUsd: rule.thresholdUsd,
      dualWaived: resolved.waiveDual,
      dualForced: resolved.forceDual,
      dualRequired: true,
      reasons: [
        `${second.name} (${second.role}) is not an allowed second signer for ${rule.label}.`,
      ],
      nextSteps: [
        `Allowed seconds: ${peopleList(eligibleSeconds.filter((p) => p.id !== initiator.id))}.`,
      ],
      eligibleSeconds: eligibleSeconds.filter((p) => p.id !== initiator.id),
      initiator: initiatorMeta,
      second: secondMeta,
      mitigatesRules: rule.mitigatesRuleIds,
      appliedException: resolved.applied,
      controlCredit: baseCredit,
    };
  }

  return {
    status: "approved_dual",
    ok: true,
    channel: request.channel,
    amountUsd: request.amountUsd,
    thresholdUsd: Math.max(0, effectiveThreshold),
    baseThresholdUsd: rule.thresholdUsd,
    dualWaived: resolved.waiveDual,
    dualForced: resolved.forceDual,
    dualRequired: true,
    reasons: [
      `Dual release complete: ${initiator.name} → ${second.name}.`,
      `Channel ${rule.label} above effective threshold $${Math.max(0, effectiveThreshold).toLocaleString()}.`,
      ...(resolved.applied
        ? [`Exception applied: ${resolved.applied.label} (${resolved.applied.action}).`]
        : []),
    ],
    nextSteps: [
      "Retain both signatures / system audit log.",
      "Re-score residual risk — vendor/write-off conflicts should show dual-release mitigation.",
    ],
    eligibleSeconds: eligibleSeconds.filter((p) => p.id !== initiator.id),
    initiator: initiatorMeta,
    second: secondMeta,
    mitigatesRules: rule.mitigatesRuleIds,
    appliedException: resolved.applied,
    controlCredit: baseCredit,
  };
}

/**
 * The conflict rules an active dual-release policy narrows. With the team
 * given, a channel counts only when someone on it may initiate and a
 * different person may second: a policy nobody can operate, or one where the
 * only second signer is the initiator, narrows nothing.
 */
export function mitigatedSodRuleIds(
  policy: DualReleasePolicy,
  tpl?: Pick<IndustryTemplate, "people">,
): Set<string> {
  const ids = new Set<string>();
  if (!policy.enabled) return ids;
  for (const r of policy.rules) {
    if (!r.enabled) continue;
    if (tpl && !hasDistinctSecond(tpl, policy, r.channel)) continue;
    for (const mid of r.mitigatesRuleIds) ids.add(mid);
  }
  return ids;
}

function hasDistinctSecond(
  tpl: Pick<IndustryTemplate, "people">,
  policy: DualReleasePolicy,
  channel: ReleaseChannel,
): boolean {
  const eligible = listEligibleApprovers(tpl as IndustryTemplate, policy, channel);
  const initiators = eligible.filter((p) => p.canInitiate);
  const seconds = eligible.filter((p) => p.canSecond);
  return initiators.some((a) => seconds.some((b) => b.id !== a.id));
}

export function dualReleaseCoverage(policy: DualReleasePolicy): DualReleaseCoverage[] {
  return policy.rules.map((r) => ({
    channel: r.channel,
    label: r.label,
    enabled: policy.enabled && r.enabled,
    thresholdUsd: r.thresholdUsd,
    mitigatesRuleIds: r.mitigatesRuleIds,
    covered: policy.enabled && r.enabled,
    activeExceptions: (policy.exceptions ?? []).filter(
      (e) => e.enabled && (e.channels.length === 0 || e.channels.includes(r.channel)),
    ).length,
  }));
}

export function staffFlagsFromDualRelease(policy: DualReleasePolicy): {
  dualControlPayments: boolean;
} {
  const ach = policy.rules.find((r) => r.channel === "ach");
  const deposit = policy.rules.find((r) => r.channel === "deposit");
  const dualControlPayments = Boolean(policy.enabled && (ach?.enabled || deposit?.enabled));
  return { dualControlPayments };
}

export function activeExceptionSummary(policy: DualReleasePolicy): {
  total: number;
  raises: number;
  forceDual: number;
  waives: number;
  expiringSoon: number;
} {
  const today = todayIso();
  const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const active = (policy.exceptions ?? []).filter((e) => e.enabled && isDateActive(e, today));
  return {
    total: active.length,
    raises: active.filter((e) => e.action === "raise_threshold").length,
    forceDual: active.filter((e) => e.action === "force_dual").length,
    waives: active.filter((e) => e.action === "waive_dual").length,
    expiringSoon: active.filter((e) => e.effectiveTo && e.effectiveTo <= in30).length,
  };
}
