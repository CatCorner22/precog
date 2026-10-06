import { useEffect, useMemo, useState } from "react";
import { getIndustryCopy } from "@/lib/precog/templates/industry-copy";
import {
  activeExceptionSummary,
  DUAL_RELEASE_MAX_USD,
  dualReleaseCoverage,
  evaluateRelease,
  listEligibleApprovers,
  makeExceptionId,
  type DualReleasePolicy,
  type ReleaseChannel,
  type ReleaseEvaluation,
} from "@/lib/precog/controls/dual-release";
import { usePractice, useTemplate } from "@/lib/precog/practice-context";
import { personLabel } from "@/lib/precog/person-label";
import { dateAfter, localDateKey } from "@/lib/precog/dates";
import { useToday } from "@/lib/use-today";
import { soleOwnerId } from "@/lib/precog/sod/owner-role";
import { formatUsdTyped } from "@/lib/utils";
import {
  EMPTY_EXCEPTION_FORM,
  exceptionDecision,
  exceptionFromForm,
  policyDecision,
  withMasterSwitch,
  type ExceptionForm,
} from "./dual-release-panel-actions";

/**
 * Read a typed payment threshold. Commas and a leading "$" are dropped, and
 * only digits with up to two decimals are read, so "1,000" is 1000 and
 * "0x10" or "1e3" is not an amount. A blank, non-numeric or negative entry is
 * an error and saves nothing; an amount above the most Precog stores saves
 * that most, with a note saying so. Cents are kept as typed.
 */
export function readThreshold(draft: string): { value: number; note?: string } | { error: string } {
  const text = draft
    .trim()
    .replace(/^\$\s*/, "")
    .replaceAll(",", "");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return { error: "Enter an amount of $0 or more." };
  const typed = Number(text);
  if (typed > DUAL_RELEASE_MAX_USD) {
    return {
      value: DUAL_RELEASE_MAX_USD,
      note: `Kept at ${formatUsdTyped(DUAL_RELEASE_MAX_USD)}, the most this figure accepts.`,
    };
  }
  return { value: keepCents(typed) };
}

/** The policy with one channel's threshold set, to the cent and never below $0. */
export function withThreshold(
  policy: DualReleasePolicy,
  ch: ReleaseChannel,
  thresholdUsd: number,
): DualReleasePolicy {
  return {
    ...policy,
    rules: policy.rules.map((r) =>
      r.channel === ch ? { ...r, thresholdUsd: Math.max(0, keepCents(thresholdUsd)) } : r,
    ),
  };
}

/**
 * A saved threshold as its field shows it: whole dollars as typed, an amount
 * with cents to two places, so 12.5 reads "12.50" as the card above it does.
 */
export function thresholdText(usd: number): string {
  return Number.isInteger(usd) ? String(usd) : usd.toFixed(2);
}

/** An amount to the cent: 12.75 stays 12.75, never 13. */
function keepCents(usd: number): number {
  return Math.round(usd * 100) / 100;
}

export function useDualReleasePanel() {
  const tpl = useTemplate();
  const people = useMemo(() => tpl.people.filter((p) => p.active), [tpl.people]);
  const { profile, setDualRelease, addDecision } = usePractice();
  const policy = profile.dualRelease;
  const seed = getIndustryCopy(profile.industry).dualReleaseSeed;
  const payeeHint = policy.exceptions.find((e) => e.enabled && e.payeeContains)?.payeeContains;

  const [channel, setChannel] = useState<ReleaseChannel>("ach");
  const [amount, setAmount] = useState(2500);
  const [initiatorId, setInitiatorId] = useState(people[1]?.id ?? people[0]?.id ?? "");
  const [secondId, setSecondId] = useState<string>(people[0]?.id ?? "");
  // The simulator's payee starts from the first exception's payee and resets
  // only when the line of business changes: adding an exception never
  // overwrites what the owner typed.
  const [payee, setPayee] = useState(payeeHint ?? "");
  const [payeeIndustry, setPayeeIndustry] = useState(profile.industry);
  if (payeeIndustry !== profile.industry) {
    setPayeeIndustry(profile.industry);
    setPayee(payeeHint ?? "");
  }

  useEffect(() => {
    if (!people.some((p) => p.id === initiatorId)) {
      setInitiatorId(people[1]?.id ?? people[0]?.id ?? "");
    }
    if (secondId && !people.some((p) => p.id === secondId)) {
      setSecondId(people[0]?.id ?? "");
    }
  }, [people, initiatorId, secondId]);

  // Once the owner has checked a payment, the verdict follows the policy and
  // the form, so it never describes settings that are no longer on screen.
  const [checked, setChecked] = useState(false);
  const [showExForm, setShowExForm] = useState(false);
  const [exForm, setExForm] = useState<ExceptionForm>(EMPTY_EXCEPTION_FORM);

  const today = localDateKey(useToday());
  const coverage = useMemo(() => dualReleaseCoverage(policy), [policy]);
  const exSummary = useMemo(() => activeExceptionSummary(policy, today), [policy, today]);
  const activeRule = policy.rules.find((r) => r.channel === channel);
  const secondsLine = useMemo(() => {
    const seconds = listEligibleApprovers(tpl, policy, channel).filter((p) => p.canSecond);
    return seconds.length
      ? seconds.map((p) => personLabel(p.name, p.role)).join(", ")
      : "nobody on the team holds a duty that allows it";
  }, [tpl, policy, channel]);
  const exceptions = policy.exceptions ?? [];

  function toggleMaster(enabled: boolean) {
    setDualRelease(withMasterSwitch(policy, enabled));
  }

  function toggleChannel(ch: ReleaseChannel, enabled: boolean) {
    setDualRelease({
      ...policy,
      rules: policy.rules.map((r) => (r.channel === ch ? { ...r, enabled } : r)),
    });
  }

  function setThreshold(ch: ReleaseChannel, thresholdUsd: number) {
    setDualRelease(withThreshold(policy, ch, thresholdUsd));
  }

  const lastEval: ReleaseEvaluation | null = useMemo(
    () =>
      checked
        ? evaluateRelease(tpl, policy, {
            channel,
            amountUsd: amount,
            initiatorPersonId: initiatorId,
            secondPersonId: secondId || undefined,
            payee,
            memo: "Simulator release",
            asOfDate: today,
          })
        : null,
    [checked, tpl, policy, channel, amount, initiatorId, secondId, payee, today],
  );

  function runEval() {
    setChecked(true);
  }

  function removeException(id: string) {
    setDualRelease({
      ...policy,
      exceptions: exceptions.filter((e) => e.id !== id),
    });
  }

  function toggleException(id: string, enabled: boolean) {
    setDualRelease({
      ...policy,
      exceptions: exceptions.map((e) => (e.id === id ? { ...e, enabled } : e)),
    });
  }

  function updateExForm(patch: Partial<ExceptionForm>) {
    setExForm((current) => ({ ...current, ...patch }));
  }

  function toggleExChannel(ch: ReleaseChannel) {
    setExForm((current) => ({
      ...current,
      channels: current.channels.includes(ch)
        ? current.channels.filter((c) => c !== ch)
        : [...current.channels, ch],
    }));
  }

  function addException() {
    const ex = exceptionFromForm(exForm, {
      id: makeExceptionId(),
      createdAt: today,
      approvedByPersonId: soleOwnerId(people, profile.industry),
    });
    if (!ex) return;
    setDualRelease({ ...policy, exceptions: [ex, ...exceptions.filter((e) => e.id !== ex.id)] });
    addDecision(exceptionDecision(ex));
    setShowExForm(false);
    setExForm(EMPTY_EXCEPTION_FORM);
  }

  function logAsRemediation() {
    addDecision(policyDecision(policy, coverage, exSummary.total, dateAfter(new Date(), 90)));
  }

  function setPolicyOption(patch: Partial<typeof policy>) {
    setDualRelease({ ...policy, ...patch });
  }

  return {
    tpl,
    people,
    policy,
    seed,
    payeeHint,
    channel,
    setChannel,
    amount,
    setAmount,
    initiatorId,
    setInitiatorId,
    secondId,
    setSecondId,
    payee,
    setPayee,
    lastEval,
    showExForm,
    setShowExForm,
    exForm,
    updateExForm,
    coverage,
    exSummary,
    activeRule,
    secondsLine,
    exceptions,
    toggleMaster,
    toggleChannel,
    setThreshold,
    runEval,
    removeException,
    toggleException,
    addException,
    logAsRemediation,
    toggleExChannel,
    setPolicyOption,
  };
}

export type DualReleasePanelModel = ReturnType<typeof useDualReleasePanel>;
