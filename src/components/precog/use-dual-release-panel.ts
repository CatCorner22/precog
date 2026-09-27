import { useEffect, useMemo, useState } from "react";
import { getIndustryCopy } from "@/lib/precog/templates/industry-copy";
import {
  activeExceptionSummary,
  dualReleaseCoverage,
  evaluateRelease,
  listEligibleApprovers,
  makeExceptionId,
  type ReleaseChannel,
  type ReleaseEvaluation,
} from "@/lib/precog/controls/dual-release";
import { usePractice, useTemplate } from "@/lib/precog/practice-context";
import { personLabel } from "@/lib/precog/person-label";
import { dateAfter, localDateKey } from "@/lib/precog/dates";
import { useToday } from "@/lib/precog/decisions/use-today";
import { soleOwnerId } from "@/lib/precog/sod/owner-role";
import {
  EMPTY_EXCEPTION_FORM,
  exceptionDecision,
  exceptionFromForm,
  policyDecision,
  withMasterSwitch,
  type ExceptionForm,
} from "./dual-release-panel-actions";

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

  const [lastEval, setLastEval] = useState<ReleaseEvaluation | null>(null);
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
    setDualRelease({
      ...policy,
      rules: policy.rules.map((r) =>
        r.channel === ch ? { ...r, thresholdUsd: Math.max(0, Math.round(thresholdUsd)) } : r,
      ),
    });
  }

  function runEval() {
    setLastEval(
      evaluateRelease(tpl, policy, {
        channel,
        amountUsd: amount,
        initiatorPersonId: initiatorId,
        secondPersonId: secondId || undefined,
        payee,
        memo: "Simulator release",
        asOfDate: today,
      }),
    );
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
      approvedByPersonId: soleOwnerId(people),
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
