import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import type { Person, ProcessNode, StaffComposition } from "./types";
import type { RiskVariableState } from "./scoring/dynamic-variables";
import {
  mergeDualReleasePolicy,
  staffFlagsFromDualRelease,
  type DualReleasePolicy,
} from "./controls/dual-release";
import { INDUSTRIES, industryMeta, type IndustryId } from "./industry";
import {
  deleteBusiness as deleteBusinessRemote,
  listBusinesses,
  loadBusiness,
  loadBusinessProfile,
  saveBusinessProfile,
} from "./profile-server";
import { listCheckins, type CheckinRecord } from "./builder/review-link-server";
import { appendAudit, diffAudit } from "./builder/audit";
import { makeTestId, type ControlTestRecord } from "./builder/test-plan";
import { setRiskAppetite, type RiskAppetite } from "./appetite";
import type { InsuranceProfile } from "./insurance/types";
import type { InsuranceMove } from "./insurance/model";
import {
  setActiveIndustry,
  setPeopleOverrides,
  setProcessOverrides,
} from "./active-template";
import { getIndustryTemplate } from "./templates";
import {
  defaultProfile,
  loadPortfolio,
  loadProfile,
  makeBusinessId,
  makeDecisionId,
  removePortfolioEntry,
  savePortfolioEntry,
  saveProfile,
  summarizeBusiness,
  type BusinessSummary,
  type DecisionEntry,
  type DecisionKind,
  type MapVersion,
  type PracticeProfile,
} from "./practice-profile";
import type { SavedProcessBlock } from "./builder/process-blocks";

export type SyncStatus = "idle" | "loading" | "synced" | "local" | "error";

interface PracticeContextValue {
  profile: PracticeProfile;
  ready: boolean;
  syncStatus: SyncStatus;
  /** Bumps when the active industry template swaps — drives useTemplate() re-renders. */
  templateRevision: number;
  setPracticeName: (name: string) => void;
  setIndustry: (industry: IndustryId) => void;
  setStaff: (staff: StaffComposition | ((s: StaffComposition) => StaffComposition)) => void;
  setRiskVariables: (
    v: RiskVariableState | ((r: RiskVariableState) => RiskVariableState),
  ) => void;
  setDualRelease: (
    v: DualReleasePolicy | ((d: DualReleasePolicy) => DualReleasePolicy),
  ) => void;
  addDecision: (input: {
    subject: string;
    kind: DecisionKind;
    note: string;
    reviewBy?: string;
    residualAtDecision?: number;
    linkedTab?: string;
    linkedId?: string;
  }) => void;
  removeDecision: (id: string) => void;
  resetProfile: () => void;
  /** First-visit picker: load the template and mark onboarding done. */
  completeOnboarding: (industry: IndustryId) => void;
  /** Map builder: replace the process map (null = back to industry template). */
  setCustomProcesses: (
    v: ProcessNode[] | null | ((current: ProcessNode[]) => ProcessNode[] | null),
  ) => void;
  /** Map builder: replace the demo team with real people (null = template people). */
  setCustomPeople: (
    v: Person[] | null | ((current: Person[]) => Person[] | null),
  ) => void;
  /** Map builder: pin canvas positions for process nodes. */
  setMapLayout: (
    v:
      | Record<string, { x: number; y: number }>
      | ((l: Record<string, { x: number; y: number }>) => Record<string, { x: number; y: number }>),
  ) => void;
  /** True when the process map differs from the industry template. */
  mapCustomized: boolean;
  /** Save or replace user-defined reusable process blocks. */
  setSavedProcessBlocks: (
    v:
      | SavedProcessBlock[]
      | ((blocks: SavedProcessBlock[]) => SavedProcessBlock[]),
  ) => void;
  /** Append a map health snapshot when the score changes (deduped, capped). */
  recordMapHealth: (score: number) => void;
  /** Map builder undo/redo over processes + team edits. */
  undoMap: () => void;
  redoMap: () => void;
  canUndoMap: boolean;
  canRedoMap: boolean;
  /** Named map snapshots. */
  saveMapVersion: (name: string, healthScore: number) => MapVersion;
  deleteMapVersion: (id: string) => void;
  restoreMapVersion: (id: string) => void;
  /** Multi-business portfolio (advisors, multi-location owners). */
  businesses: BusinessSummary[];
  switchBusiness: (id: string) => Promise<void>;
  createBusiness: (industry: IndustryId, name?: string) => void;
  deleteBusiness: (id: string) => Promise<void>;
  switchingBusiness: boolean;
  /** True when signed in with a real account (cloud sync + sharing available). */
  cloudUser: boolean;
  /** Pull reviewer check-ins and merge into evidence; resolves with the number applied. */
  refreshCheckins: () => Promise<number>;
  /** Recent reviewer check-ins for the active business (after refresh). */
  checkins: CheckinRecord[];
  /** Record an auditor-style control test result. */
  recordControlTest: (test: Omit<ControlTestRecord, "id" | "testedAt"> & { testedAt?: string }) => void;
  /** Retune thresholds app-wide. */
  setAppetite: (appetite: RiskAppetite) => void;
  /** Toggle a first-30-days plan item. */
  togglePlanItem: (id: string) => void;
  /** Update insurance facts / attestations. */
  setInsurance: (patch: Partial<InsuranceProfile> | ((cur: InsuranceProfile) => InsuranceProfile)) => void;
  /** Apply a simulated insurance move for real: flips the matching staff / risk-variable flag or records an attestation. */
  applyInsuranceMove: (move: InsuranceMove) => "applied" | "attested" | "manual";
}

/** Apply check-ins to evidence: newest completion wins, whoever recorded it. */
export function mergeCheckins(processes: ProcessNode[], checkins: CheckinRecord[]): { processes: ProcessNode[]; applied: number } {
  if (!checkins.length) return { processes, applied: 0 };
  const latest = new Map<string, CheckinRecord>();
  for (const c of checkins) {
    const k = `${c.processId}::${c.evidenceId}`;
    const cur = latest.get(k);
    if (!cur || new Date(c.doneAt) > new Date(cur.doneAt)) latest.set(k, c);
  }
  let applied = 0;
  const next = processes.map((p) => {
    if (!p.evidence?.length) return p;
    let changed = false;
    const evidence = p.evidence.map((e) => {
      const c = latest.get(`${p.id}::${e.id}`);
      if (!c) return e;
      const have = e.lastDoneAt ? new Date(e.lastDoneAt).getTime() : 0;
      if (new Date(c.doneAt).getTime() <= have) return e;
      changed = true;
      applied += 1;
      return { ...e, lastDoneAt: c.doneAt, lastDoneBy: c.byName };
    });
    return changed ? { ...p, evidence } : p;
  });
  return { processes: next, applied };
}

const MAX_VERSIONS = 12;

interface MapSnapshot {
  customProcesses: ProcessNode[] | null | undefined;
  customPeople: Person[] | null | undefined;
}

const MAX_UNDO = 50;
const MAX_HEALTH_POINTS = 90;

const PracticeContext = createContext<PracticeContextValue | null>(null);

const SAVE_DEBOUNCE_MS = 1200;

export function PracticeProvider({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  const [profile, setProfile] = useState<PracticeProfile>(defaultProfile);
  const [ready, setReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [templateRevision, setTemplateRevision] = useState(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cloudLoadedFor = useRef<string | null>(null);
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const undoStack = useRef<MapSnapshot[]>([]);
  const redoStack = useRef<MapSnapshot[]>([]);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [remoteBusinesses, setRemoteBusinesses] = useState<BusinessSummary[]>([]);
  const [portfolioVersion, setPortfolioVersion] = useState(0);
  const [switchingBusiness, setSwitchingBusiness] = useState(false);
  const [checkins, setCheckins] = useState<CheckinRecord[]>([]);
  const auditPrev = useRef<PracticeProfile | null>(null);

  const pushUndo = useCallback(() => {
    const p = profileRef.current;
    undoStack.current.push({
      customProcesses: p.customProcesses,
      customPeople: p.customPeople,
    });
    if (undoStack.current.length > MAX_UNDO) undoStack.current.shift();
    redoStack.current = [];
    setHistoryVersion((v) => v + 1);
  }, []);

  const applySnapshot = useCallback((snap: MapSnapshot) => {
    setProcessOverrides(snap.customProcesses ?? null);
    setPeopleOverrides(snap.customPeople ?? null);
    setTemplateRevision((r) => r + 1);
    setProfile((p) => ({
      ...p,
      customProcesses: snap.customProcesses ?? null,
      customPeople: snap.customPeople ?? null,
    }));
  }, []);

  const undoMap = useCallback(() => {
    const snap = undoStack.current.pop();
    if (!snap) return;
    const p = profileRef.current;
    redoStack.current.push({
      customProcesses: p.customProcesses,
      customPeople: p.customPeople,
    });
    applySnapshot(snap);
    setHistoryVersion((v) => v + 1);
  }, [applySnapshot]);

  const redoMap = useCallback(() => {
    const snap = redoStack.current.pop();
    if (!snap) return;
    const p = profileRef.current;
    undoStack.current.push({
      customProcesses: p.customProcesses,
      customPeople: p.customPeople,
    });
    applySnapshot(snap);
    setHistoryVersion((v) => v + 1);
  }, [applySnapshot]);

  const clearHistory = useCallback(() => {
    undoStack.current = [];
    redoStack.current = [];
    setHistoryVersion((v) => v + 1);
  }, []);

  /** Swap the whole active business — template, overrides, history, profile. */
  const activateProfile = useCallback((next: PracticeProfile) => {
    setActiveIndustry(next.industry);
    setProcessOverrides(next.customProcesses ?? null);
    setPeopleOverrides(next.customPeople ?? null);
    setRiskAppetite(next.riskAppetite);
    setTemplateRevision((r) => r + 1);
    undoStack.current = [];
    redoStack.current = [];
    setHistoryVersion((v) => v + 1);
    setProfile(next);
  }, []);

  // Bootstrap: local first, then cloud when signed in
  useEffect(() => {
    const loaded = loadProfile();
    activateProfile(loaded);
    setReady(true);
  }, [activateProfile]);

  useEffect(() => {
    if (!ready || isPending) return;
    if (!user) {
      setSyncStatus("local");
      cloudLoadedFor.current = null;
      return;
    }
    if (cloudLoadedFor.current === user.id) return;

    let cancelled = false;
    setSyncStatus("loading");
    void Promise.all([loadBusinessProfile(), listBusinesses().catch(() => [])])
      .then(([res, list]) => {
        if (cancelled) return;
        cloudLoadedFor.current = user.id;
        const local = profileRef.current;
        if (res.found && res.profile) {
          // Newer side wins: a reload right after a local edit must not be clobbered by a stale cloud row.
          const cloudNewer =
            new Date(res.profile.updatedAt).getTime() > new Date(local.updatedAt).getTime();
          if (cloudNewer) {
            activateProfile(res.profile);
            saveProfile(res.profile);
            savePortfolioEntry(res.profile);
          } else {
            void saveBusinessProfile({ data: { profile: local, industry: local.industry } }).catch(
              () => undefined,
            );
          }
        } else {
          void saveBusinessProfile({ data: { profile: local, industry: local.industry } }).catch(
            () => undefined,
          );
        }
        setRemoteBusinesses(list);
        setSyncStatus("synced");
      })
      .catch(() => {
        if (!cancelled) setSyncStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [ready, isPending, user?.id, user?.isDevFallback, activateProfile]);

  // Persist locally + debounced cloud save
  useEffect(() => {
    if (!ready) return;

    // Derive audit entries from the state transition (same business only).
    const prev = auditPrev.current;
    auditPrev.current = profile;
    if (prev && prev !== profile && (prev.businessId ?? "biz_default") === (profile.businessId ?? "biz_default")) {
      const tpl = getIndustryTemplate(profile.industry);
      const entries = diffAudit(prev, profile, {
        templateProcesses: tpl.processes,
        people: profile.customPeople ?? tpl.people,
        controlNames: Object.fromEntries(tpl.controls.map((c) => [c.id, c.name])),
      });
      if (entries.length) {
        setProfile((p) => ({ ...p, auditLog: appendAudit(p.auditLog, entries) }));
        return; // the follow-up render persists the version that includes the log
      }
    }

    // Stamp once so local, portfolio, and cloud copies agree on "when" for newer-wins merges.
    const stamped: PracticeProfile = { ...profile, updatedAt: new Date().toISOString() };
    saveProfile(stamped);
    savePortfolioEntry(stamped);
    setPortfolioVersion((v) => v + 1);

    if (!user) {
      setSyncStatus("local");
      return;
    }

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void saveBusinessProfile({ data: { profile: stamped, industry: stamped.industry } })
        .then(() => setSyncStatus("synced"))
        .catch(() => setSyncStatus("error"));
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [profile, ready, user?.id, user?.isDevFallback]);

  const setPracticeName = useCallback((name: string) => {
    setProfile((p) => ({ ...p, practiceName: name.slice(0, 80) }));
  }, []);

  const setIndustry = useCallback((industry: IndustryId) => {
    clearHistory();
    setActiveIndustry(industry);
    setProcessOverrides(null);
    setPeopleOverrides(null);
    setTemplateRevision((r) => r + 1);
    const meta = industryMeta(industry);
    const tpl = getIndustryTemplate(industry);
    const staff = { ...tpl.staffComposition };
    const fresh = defaultProfile(industry);
    setProfile((p) => ({
      ...fresh,
      practiceName: DEMO_NAMES.has(p.practiceName) ? meta.demoName : p.practiceName,
      decisions: p.decisions,
      businessId: p.businessId,
      riskAppetite: p.riskAppetite,
      createdAt: p.createdAt,
      insurance: p.insurance,
      auditLog: p.auditLog,
      onboardingComplete: true,
    }));
  }, [clearHistory]);

  const setStaff = useCallback(
    (staff: StaffComposition | ((s: StaffComposition) => StaffComposition)) => {
      setProfile((p) => {
        const next = typeof staff === "function" ? staff(p.staff) : staff;
        const dualRelease = {
          ...p.dualRelease,
          enabled: next.dualControlPayments,
        };
        return {
          ...p,
          staff: next,
          dualRelease,
          riskVariables: {
            ...p.riskVariables,
            hasDualControl: next.dualControlPayments,
            hasIndependentBankRec: next.independentBankRec,
          },
        };
      });
    },
    [],
  );

  const setRiskVariables = useCallback(
    (v: RiskVariableState | ((r: RiskVariableState) => RiskVariableState)) => {
      setProfile((p) => {
        const next = typeof v === "function" ? v(p.riskVariables) : v;
        return {
          ...p,
          riskVariables: next,
          staff: {
            ...p.staff,
            dualControlPayments: next.hasDualControl,
            independentBankRec: next.hasIndependentBankRec,
          },
          dualRelease: {
            ...p.dualRelease,
            enabled: next.hasDualControl,
          },
        };
      });
    },
    [],
  );

  const setDualRelease = useCallback(
    (v: DualReleasePolicy | ((d: DualReleasePolicy) => DualReleasePolicy)) => {
      setProfile((p) => {
        const raw = typeof v === "function" ? v(p.dualRelease) : v;
        const dualRelease = mergeDualReleasePolicy(raw, p.staff);
        const flags = staffFlagsFromDualRelease(dualRelease);
        return {
          ...p,
          dualRelease: {
            ...dualRelease,
            updatedAt: new Date().toISOString(),
          },
          staff: {
            ...p.staff,
            dualControlPayments: flags.dualControlPayments,
          },
          riskVariables: {
            ...p.riskVariables,
            hasDualControl: flags.dualControlPayments,
          },
        };
      });
    },
    [],
  );

  const addDecision = useCallback(
    (input: {
      subject: string;
      kind: DecisionKind;
      note: string;
      reviewBy?: string;
      residualAtDecision?: number;
      linkedTab?: string;
      linkedId?: string;
    }) => {
      const entry: DecisionEntry = {
        id: makeDecisionId(),
        createdAt: new Date().toISOString(),
        subject: input.subject.slice(0, 120),
        kind: input.kind,
        note: input.note.slice(0, 800),
        reviewBy: input.reviewBy,
        residualAtDecision: input.residualAtDecision,
        linkedTab: input.linkedTab,
        linkedId: input.linkedId,
      };
      setProfile((p) => ({ ...p, decisions: [entry, ...p.decisions].slice(0, 100) }));
    },
    [],
  );

  const removeDecision = useCallback((id: string) => {
    setProfile((p) => ({
      ...p,
      decisions: p.decisions.filter((d) => d.id !== id),
    }));
  }, []);

  const resetProfile = useCallback(() => {
    clearHistory();
    setProfile((p) => {
      setActiveIndustry(p.industry);
      setProcessOverrides(null);
      setPeopleOverrides(null);
      setTemplateRevision((r) => r + 1);
      return { ...defaultProfile(p.industry), businessId: p.businessId };
    });
  }, [clearHistory]);

  const completeOnboarding = useCallback((industry: IndustryId) => {
    clearHistory();
    setActiveIndustry(industry);
    setProcessOverrides(null);
    setPeopleOverrides(null);
    setTemplateRevision((r) => r + 1);
    setProfile((p) => ({
      ...defaultProfile(industry),
      decisions: p.decisions,
      businessId: p.businessId,
      riskAppetite: p.riskAppetite,
      createdAt: p.createdAt,
      insurance: p.insurance,
      auditLog: p.auditLog,
      onboardingComplete: true,
    }));
  }, [clearHistory]);

  const setCustomPeople = useCallback(
    (v: Person[] | null | ((current: Person[]) => Person[] | null)) => {
      pushUndo();
      setProfile((p) => {
        const current = p.customPeople ?? getIndustryTemplate(p.industry).people;
        const next = typeof v === "function" ? v(current) : v;
        setPeopleOverrides(next);
        setTemplateRevision((r) => r + 1);
        return { ...p, customPeople: next };
      });
    },
    [],
  );

  const setCustomProcesses = useCallback(
    (
      v: ProcessNode[] | null | ((current: ProcessNode[]) => ProcessNode[] | null),
    ) => {
      pushUndo();
      setProfile((p) => {
        const current =
          p.customProcesses ?? getIndustryTemplate(p.industry).processes;
        const next = typeof v === "function" ? v(current) : v;
        setProcessOverrides(next);
        setTemplateRevision((r) => r + 1);
        return { ...p, customProcesses: next };
      });
    },
    [],
  );

  const setMapLayout = useCallback(
    (
      v:
        | Record<string, { x: number; y: number }>
        | ((
            l: Record<string, { x: number; y: number }>,
          ) => Record<string, { x: number; y: number }>),
    ) => {
      setProfile((p) => {
        const cur = p.mapLayout ?? {};
        const next = typeof v === "function" ? v(cur) : v;
        return { ...p, mapLayout: next };
      });
    },
    [],
  );

  const mapCustomized = Boolean(
    profile.customProcesses ||
      profile.customPeople ||
      Object.keys(profile.mapLayout ?? {}).length > 0,
  );

  const setSavedProcessBlocks = useCallback(
    (
      v: SavedProcessBlock[] | ((blocks: SavedProcessBlock[]) => SavedProcessBlock[]),
    ) => {
      setProfile((p) => {
        const cur = p.savedProcessBlocks ?? [];
        const next = typeof v === "function" ? v(cur) : v;
        return { ...p, savedProcessBlocks: next.slice(0, 24) };
      });
    },
    [],
  );

  const recordMapHealth = useCallback((score: number) => {
    setProfile((p) => {
      const history = p.mapHealthHistory ?? [];
      const last = history[history.length - 1];
      if (last && last.score === score) return p;
      const now = new Date();
      // Collapse rapid edits within the same minute into one point.
      const trimmed =
        last && now.getTime() - new Date(last.at).getTime() < 60_000
          ? history.slice(0, -1)
          : history;
      const next = [...trimmed, { at: now.toISOString(), score }].slice(-MAX_HEALTH_POINTS);
      return { ...p, mapHealthHistory: next };
    });
  }, []);

  const saveMapVersion = useCallback((name: string, healthScore: number): MapVersion => {
    const p = profileRef.current;
    const tpl = getIndustryTemplate(p.industry);
    const version: MapVersion = {
      id: `ver_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim().slice(0, 60) || `Version ${new Date().toLocaleDateString()}`,
      createdAt: new Date().toISOString(),
      healthScore,
      processes: structuredClone(p.customProcesses ?? tpl.processes),
      people: structuredClone(p.customPeople ?? tpl.people),
      layout: { ...(p.mapLayout ?? {}) },
    };
    setProfile((cur) => ({
      ...cur,
      mapVersions: [version, ...(cur.mapVersions ?? [])].slice(0, MAX_VERSIONS),
    }));
    return version;
  }, []);

  const deleteMapVersion = useCallback((id: string) => {
    setProfile((p) => ({
      ...p,
      mapVersions: (p.mapVersions ?? []).filter((v) => v.id !== id),
    }));
  }, []);

  const restoreMapVersion = useCallback(
    (id: string) => {
      const v = profileRef.current.mapVersions?.find((x) => x.id === id);
      if (!v) return;
      pushUndo();
      const processes = structuredClone(v.processes);
      const people = structuredClone(v.people);
      setProcessOverrides(processes);
      setPeopleOverrides(people);
      setTemplateRevision((r) => r + 1);
      setProfile((p) => ({
        ...p,
        customProcesses: processes,
        customPeople: people,
        mapLayout: { ...v.layout },
      }));
    },
    [pushUndo],
  );

  const canUndoMap = undoStack.current.length > 0;
  const canRedoMap = redoStack.current.length > 0;

  const cloudUser = Boolean(user);

  /** Local portfolio + cloud summaries merged by id; the active business always wins. */
  const businesses = useMemo<BusinessSummary[]>(() => {
    const byId = new Map<string, BusinessSummary>();
    for (const b of remoteBusinesses) byId.set(b.id, b);
    for (const p of Object.values(loadPortfolio())) {
      const s = summarizeBusiness(p);
      const existing = byId.get(s.id);
      if (!existing || new Date(s.updatedAt) >= new Date(existing.updatedAt)) byId.set(s.id, s);
    }
    byId.set(profile.businessId ?? "biz_default", summarizeBusiness(profile));
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteBusinesses, profile.businessId, profile.practiceName, profile.industry, profile.updatedAt, portfolioVersion]);

  const flushActive = useCallback(async () => {
    const cur = profileRef.current;
    saveProfile(cur);
    savePortfolioEntry(cur);
    if (cloudUser) {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      await saveBusinessProfile({ data: { profile: cur, industry: cur.industry } }).catch(() => undefined);
    }
  }, [cloudUser]);

  const switchBusiness = useCallback(
    async (id: string) => {
      if (id === (profileRef.current.businessId ?? "biz_default")) return;
      setSwitchingBusiness(true);
      try {
        await flushActive();
        let next: PracticeProfile | null = loadPortfolio()[id] ?? null;
        if (cloudUser) {
          const remote = await loadBusiness({ data: { id } }).catch(() => null);
          if (remote?.found && remote.profile) {
            if (!next || new Date(remote.profile.updatedAt) >= new Date(next.updatedAt)) next = remote.profile;
          }
        }
        if (!next) return;
        activateProfile({ ...next, businessId: id, onboardingComplete: true });
      } finally {
        setSwitchingBusiness(false);
      }
    },
    [activateProfile, cloudUser, flushActive],
  );

  const createBusiness = useCallback(
    (industry: IndustryId, name?: string) => {
      void flushActive();
      const fresh = defaultProfile(industry);
      const next: PracticeProfile = {
        ...fresh,
        businessId: makeBusinessId(),
        practiceName: name?.trim().slice(0, 80) || fresh.practiceName,
        onboardingComplete: true,
      };
      activateProfile(next);
    },
    [activateProfile, flushActive],
  );

  const refreshCheckins = useCallback(async (): Promise<number> => {
    if (!cloudUser) return 0;
    const businessId = profileRef.current.businessId ?? "biz_default";
    const list = await listCheckins({ data: { businessId } }).catch(() => [] as CheckinRecord[]);
    setCheckins(list);
    if (!list.length) return 0;
    const p = profileRef.current;
    const base = p.customProcesses ?? getIndustryTemplate(p.industry).processes;
    const merged = mergeCheckins(base, list);
    if (!merged.applied) return 0;
    setProcessOverrides(merged.processes);
    setTemplateRevision((r) => r + 1);
    setProfile((cur) => ({ ...cur, customProcesses: merged.processes }));
    return merged.applied;
  }, [cloudUser]);

  // Pull reviewer check-ins once the cloud profile is in place, and whenever the active business changes.
  useEffect(() => {
    if (!ready || !cloudUser || syncStatus === "loading") return;
    void refreshCheckins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, cloudUser, syncStatus === "loading", profile.businessId]);

  const recordControlTest = useCallback(
    (test: Omit<ControlTestRecord, "id" | "testedAt"> & { testedAt?: string }) => {
      const entry: ControlTestRecord = {
        id: makeTestId(),
        testedAt: test.testedAt ?? new Date().toISOString(),
        controlId: test.controlId,
        result: test.result,
        sampleSize: test.sampleSize,
        exceptions: test.exceptions,
        note: test.note?.trim().slice(0, 400) || undefined,
        testedBy: test.testedBy?.trim().slice(0, 60) || undefined,
      };
      setProfile((p) => ({ ...p, controlTests: [entry, ...(p.controlTests ?? [])].slice(0, 200) }));
    },
    [],
  );

  const setAppetite = useCallback((appetite: RiskAppetite) => {
    setRiskAppetite(appetite);
    setTemplateRevision((r) => r + 1);
    setProfile((p) => ({ ...p, riskAppetite: appetite }));
  }, []);

  const setInsurance = useCallback(
    (patch: Partial<InsuranceProfile> | ((cur: InsuranceProfile) => InsuranceProfile)) => {
      setProfile((p) => {
        const cur = p.insurance ?? defaultProfile(p.industry).insurance!;
        const next = typeof patch === "function" ? patch(cur) : { ...cur, ...patch };
        return { ...p, insurance: next };
      });
    },
    [],
  );

  const applyInsuranceMove = useCallback(
    (move: InsuranceMove): "applied" | "attested" | "manual" => {
      switch (move.applicable) {
        case "staff_dual":
          setProfile((p) => {
            const dualRelease = mergeDualReleasePolicy({ ...p.dualRelease, enabled: true }, p.staff);
            return {
              ...p,
              dualRelease: { ...dualRelease, updatedAt: new Date().toISOString() },
              staff: { ...p.staff, dualControlPayments: true },
              riskVariables: { ...p.riskVariables, hasDualControl: true },
            };
          });
          return "applied";
        case "staff_bankrec":
          setProfile((p) => ({
            ...p,
            staff: { ...p.staff, independentBankRec: true },
            riskVariables: { ...p.riskVariables, hasIndependentBankRec: true },
          }));
          return "applied";
        case "rv_bonded":
          setProfile((p) => ({ ...p, riskVariables: { ...p.riskVariables, hasBondedCashHandlers: true } }));
          return "applied";
        case "rv_cameras":
          setProfile((p) => ({ ...p, riskVariables: { ...p.riskVariables, hasSecurityCameras: true, hasAlarmAccess: true } }));
          return "applied";
        case "attest":
          if (move.attestation) {
            const key = move.attestation;
            setInsurance((cur) => ({ ...cur, attestations: { ...cur.attestations, [key]: true } }));
            return "attested";
          }
          return "manual";
        default:
          return "manual";
      }
    },
    [setInsurance],
  );

  const togglePlanItem = useCallback((id: string) => {
    setProfile((p) => {
      const done = new Set(p.planDone ?? []);
      if (done.has(id)) done.delete(id);
      else done.add(id);
      return { ...p, planDone: [...done] };
    });
  }, []);

  const deleteBusinessLocal = useCallback(
    async (id: string) => {
      const activeId = profileRef.current.businessId ?? "biz_default";
      if (id === activeId) return;
      removePortfolioEntry(id);
      setRemoteBusinesses((cur) => cur.filter((b) => b.id !== id));
      setPortfolioVersion((v) => v + 1);
      if (cloudUser) await deleteBusinessRemote({ data: { id } }).catch(() => undefined);
    },
    [cloudUser],
  );

  const value = useMemo(
    () => ({
      profile,
      ready,
      syncStatus,
      templateRevision,
      setPracticeName,
      setIndustry,
      setStaff,
      setRiskVariables,
      setDualRelease,
      addDecision,
      removeDecision,
      resetProfile,
      completeOnboarding,
      setCustomProcesses,
      setCustomPeople,
      setMapLayout,
      mapCustomized,
      setSavedProcessBlocks,
      recordMapHealth,
      undoMap,
      redoMap,
      canUndoMap,
      canRedoMap,
      saveMapVersion,
      deleteMapVersion,
      restoreMapVersion,
      businesses,
      switchBusiness,
      createBusiness,
      deleteBusiness: deleteBusinessLocal,
      switchingBusiness,
      cloudUser,
      refreshCheckins,
      checkins,
      recordControlTest,
      setAppetite,
      togglePlanItem,
      setInsurance,
      applyInsuranceMove,
    }),
    [
      profile,
      ready,
      syncStatus,
      templateRevision,
      setPracticeName,
      setIndustry,
      setStaff,
      setRiskVariables,
      setDualRelease,
      addDecision,
      removeDecision,
      resetProfile,
      completeOnboarding,
      setCustomProcesses,
      setCustomPeople,
      setMapLayout,
      mapCustomized,
      setSavedProcessBlocks,
      recordMapHealth,
      undoMap,
      redoMap,
      canUndoMap,
      canRedoMap,
      saveMapVersion,
      deleteMapVersion,
      restoreMapVersion,
      businesses,
      switchBusiness,
      createBusiness,
      deleteBusinessLocal,
      switchingBusiness,
      cloudUser,
      refreshCheckins,
      checkins,
      recordControlTest,
      setAppetite,
      togglePlanItem,
      setInsurance,
      applyInsuranceMove,
      // eslint-disable-next-line react-hooks/exhaustive-deps
      historyVersion,
    ],
  );

  return (
    <PracticeContext.Provider value={value}>{children}</PracticeContext.Provider>
  );
}

const DEMO_NAMES = new Set(INDUSTRIES.map((i) => i.demoName));

export function usePractice() {
  const ctx = useContext(PracticeContext);
  if (!ctx) throw new Error("usePractice requires PracticeProvider");
  return ctx;
}
