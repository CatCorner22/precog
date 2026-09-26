import { useEffect, useMemo, useState } from "react";
import { dateAfter, localDateKey } from "@/lib/precog/decisions/follow-through";
import { getIndustryCopy } from "@/lib/precog/templates/industry-copy";
import { useTemplate } from "@/lib/precog/use-template";
import {
  activeExceptionSummary,
  dualReleaseCoverage,
  evaluateRelease,
  listEligibleApprovers,
  makeExceptionId,
  type ExceptionAction,
  type ReleaseChannel,
  type ReleaseEvaluation,
  type ThresholdException,
} from "@/lib/precog/controls/dual-release";
import { usePractice } from "@/lib/precog/practice-context";
import { personLabel } from "@/lib/precog/person-label";

export function useDualReleasePanel() {
  const tpl = useTemplate();
  const people = useMemo(() => tpl.people.filter((p) => p.active), [tpl.people]);
  const { profile, setDualRelease, setStaff, addDecision } = usePractice();
  const policy = profile.dualRelease;
  const seed = getIndustryCopy(profile.industry).dualReleaseSeed;
  const payeeHint = policy.exceptions.find((e) => e.enabled && e.payeeContains)?.payeeContains;

  const [channel, setChannel] = useState<ReleaseChannel>("ach");
  const [amount, setAmount] = useState(2500);
  const [initiatorId, setInitiatorId] = useState(people[1]?.id ?? people[0]?.id ?? "");
  const [secondId, setSecondId] = useState<string>(people[0]?.id ?? "");
  const [payee, setPayee] = useState(payeeHint ?? "");

  useEffect(() => {
    setPayee(payeeHint ?? "");
  }, [profile.industry, payeeHint]);

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
  const [exLabel, setExLabel] = useState("");
  const [exAction, setExAction] = useState<ExceptionAction>("raise_threshold");
  const [exThreshold, setExThreshold] = useState(3500);
  const [exChannels, setExChannels] = useState<ReleaseChannel[]>(["ach"]);
  const [exPayee, setExPayee] = useState("");
  const [exPersonId, setExPersonId] = useState("");
  const [exRole, setExRole] = useState("");
  const [exFrom, setExFrom] = useState("");
  const [exTo, setExTo] = useState("");
  const [exReason, setExReason] = useState("");
  const [exResidual, setExResidual] = useState("");

  const coverage = useMemo(() => dualReleaseCoverage(policy), [policy]);
  const exSummary = useMemo(() => activeExceptionSummary(policy), [policy]);
  const activeRule = policy.rules.find((r) => r.channel === channel);
  const secondsLine = useMemo(() => {
    const seconds = listEligibleApprovers(tpl, policy, channel).filter((p) => p.canSecond);
    return seconds.length
      ? seconds.map((p) => personLabel(p.name, p.role)).join(", ")
      : "nobody on the team holds a duty that allows it";
  }, [tpl, policy, channel]);
  const exceptions = policy.exceptions ?? [];

  function toggleMaster(enabled: boolean) {
    setDualRelease({ ...policy, enabled });
    setStaff({ ...profile.staff, dualControlPayments: enabled });
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
      }),
    );
  }

  function upsertException(ex: ThresholdException) {
    const list = exceptions.filter((e) => e.id !== ex.id);
    setDualRelease({ ...policy, exceptions: [ex, ...list] });
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

  function addException() {
    if (!exLabel.trim() || !exReason.trim()) return;
    const ex: ThresholdException = {
      id: makeExceptionId(),
      label: exLabel.trim().slice(0, 80),
      channels: exChannels,
      action: exAction,
      thresholdUsd:
        exAction === "raise_threshold" || exAction === "lower_threshold"
          ? Math.max(0, Math.round(exThreshold))
          : undefined,
      payeeContains: exPayee.trim() || undefined,
      personId: exPersonId || undefined,
      role: exRole || undefined,
      effectiveFrom: exFrom || undefined,
      effectiveTo: exTo || undefined,
      enabled: true,
      reason: exReason.trim().slice(0, 300),
      residualNote: exResidual.trim().slice(0, 300) || undefined,
      approvedByPersonId: "p1",
      createdAt: localDateKey(new Date()),
    };
    upsertException(ex);
    addDecision({
      subject: `Threshold exception: ${ex.label}`,
      kind: ex.action === "waive_dual" ? "accept_residual" : "remediate",
      note: `${ex.action} · ${ex.reason}${ex.residualNote ? ` · Residual: ${ex.residualNote}` : ""}`,
      reviewBy: ex.effectiveTo || undefined,
      linkedTab: "sod",
    });
    setShowExForm(false);
    setExLabel("");
    setExReason("");
    setExResidual("");
    setExPayee("");
  }

  function logAsRemediation() {
    addDecision({
      subject: "Enable dual-release controls",
      kind: "remediate",
      note: `Dual release ${policy.enabled ? "ON" : "OFF"}; ${exSummary.total} active exception(s); channels: ${coverage
        .filter((c) => c.covered)
        .map((c) => c.label)
        .join(", ")}`,
      reviewBy: dateAfter(new Date(), 90),
      linkedTab: "sod",
    });
  }

  function toggleExChannel(ch: ReleaseChannel) {
    setExChannels((prev) => (prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]));
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
    exLabel,
    setExLabel,
    exAction,
    setExAction,
    exThreshold,
    setExThreshold,
    exChannels,
    exPayee,
    setExPayee,
    exPersonId,
    setExPersonId,
    exRole,
    setExRole,
    exFrom,
    setExFrom,
    exTo,
    setExTo,
    exReason,
    setExReason,
    exResidual,
    setExResidual,
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
