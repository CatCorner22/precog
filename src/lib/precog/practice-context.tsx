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
import { authEnabled } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import type { Person, ProcessNode, StaffComposition } from "./types";
import type { RiskVariableState } from "./scoring/dynamic-variables";
import {
  mergeDualReleasePolicy,
  mitigatedSodRuleIds,
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
import { resolveTemplate } from "./active-template";
import { getIndustryTemplate, type IndustryTemplate } from "./templates";
import { deriveStaffFromTeam } from "./sod/derive-staff";
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
  /** Industry template with this profile's custom people/processes applied. */
  template: IndustryTemplate;
  setPracticeName: (name: string) => void;
  setIndustry: (industry: IndustryId) => void;
  setStaff: (staff: StaffComposition | ((s: StaffComposition) => StaffComposition)) => void;
  setRiskVariables: (v: RiskVariableState | ((r: RiskVariableState) => RiskVariableState)) => void;
  setDualRelease: (v: DualReleasePolicy | ((d: DualReleasePolicy) => DualReleasePolicy)) => void;
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
  setCustomPeople: (v: Person[] | null | ((current: Person[]) => Person[] | null)) => void;
  resetSegregationToDerived: () => void;
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
    v: SavedProcessBlock[] | ((blocks: SavedProcessBlock[]) => SavedProcessBlock[]),
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
    if (!authEnabled || !user || user.isDevFallback) {
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
        if (res.found && res.profile) {
          activateProfile(res.profile);
          saveProfile(res.profile);
          savePortfolioEntry(res.profile);
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
    saveProfile(profile);
    savePortfolioEntry(profile);
    setPortfolioVersion((v) => v + 1);

    if (!authEnabled || !user || user.isDevFallback) {
      setSyncStatus("local");
      return;
    }

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void saveBusinessProfile({ data: { profile, industry: profile.industry } })
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

  const setIndustry = useCallback(
    (industry: IndustryId) => {
      clearHistory();
      const meta = industryMeta(industry);
      const fresh = defaultProfile(industry);
      setProfile((p) => ({
        ...fresh,
        practiceName: DEMO_NAMES.has(p.practiceName) ? meta.demoName : p.practiceName,
        decisions: p.decisions,
        businessId: p.businessId,
        onboardingComplete: true,
      }));
    },
    [clearHistory],
  );

  const setStaff = useCallback(
    (staff: StaffComposition | ((s: StaffComposition) => StaffComposition)) => {
      setProfile((p) => {
        const raw = typeof staff === "function" ? staff(p.staff) : staff;
        const next =
          p.customPeople && raw.segregationScore !== p.staff.segregationScore
            ? { ...raw, segregationSource: "manual" as const }
            : raw;
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
        const dualRelease = mergeDualReleasePolicy(resolveTemplate(p), raw, p.staff);
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
    setProfile((p) => ({ ...defaultProfile(p.industry), businessId: p.businessId }));
  }, [clearHistory]);

  const completeOnboarding = useCallback(
    (industry: IndustryId) => {
      clearHistory();
      setProfile((p) => ({
        ...defaultProfile(industry),
        decisions: p.decisions,
        businessId: p.businessId,
        onboardingComplete: true,
      }));
    },
    [clearHistory],
  );

  const setCustomPeople = useCallback(
    (v: Person[] | null | ((current: Person[]) => Person[] | null)) => {
      pushUndo();
      setProfile((p) => {
        const current = p.customPeople ?? getIndustryTemplate(p.industry).people;
        const next = typeof v === "function" ? v(current) : v;
        const staff = next
          ? deriveStaffFromTeam(
              resolveTemplate({
                industry: p.industry,
                customProcesses: p.customProcesses,
                customPeople: next,
              }),
              p.staff,
              { dualReleaseMitigatedRuleIds: mitigatedSodRuleIds(p.dualRelease) },
            )
          : p.staff;
        return { ...p, customPeople: next, staff };
      });
    },
    [],
  );

  const setCustomProcesses = useCallback(
    (v: ProcessNode[] | null | ((current: ProcessNode[]) => ProcessNode[] | null)) => {
      pushUndo();
      setProfile((p) => {
        const current = p.customProcesses ?? getIndustryTemplate(p.industry).processes;
        const next = typeof v === "function" ? v(current) : v;
        const staff = p.customPeople
          ? deriveStaffFromTeam(
              resolveTemplate({
                industry: p.industry,
                customProcesses: next,
                customPeople: p.customPeople,
              }),
              p.staff,
              { dualReleaseMitigatedRuleIds: mitigatedSodRuleIds(p.dualRelease) },
            )
          : p.staff;
        return { ...p, customProcesses: next, staff };
      });
    },
    [],
  );

  const resetSegregationToDerived = useCallback(() => {
    setProfile((p) => ({
      ...p,
      staff: deriveStaffFromTeam(
        resolveTemplate(p),
        { ...p.staff, segregationSource: "derived" },
        { dualReleaseMitigatedRuleIds: mitigatedSodRuleIds(p.dualRelease) },
      ),
    }));
  }, []);

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
    (v: SavedProcessBlock[] | ((blocks: SavedProcessBlock[]) => SavedProcessBlock[])) => {
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
      setProfile((p) => ({
        ...p,
        customProcesses: processes,
        customPeople: people,
        mapLayout: { ...v.layout },
      }));
    },
    [pushUndo],
  );

  const { industry, customProcesses, customPeople } = profile;
  const template = useMemo(
    () => resolveTemplate({ industry, customProcesses, customPeople }),
    [industry, customProcesses, customPeople],
  );

  const canUndoMap = undoStack.current.length > 0;
  const canRedoMap = redoStack.current.length > 0;

  const cloudUser = Boolean(authEnabled && user && !user.isDevFallback);

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
  }, [
    remoteBusinesses,
    profile.businessId,
    profile.practiceName,
    profile.industry,
    profile.updatedAt,
    portfolioVersion,
  ]);

  const flushActive = useCallback(async () => {
    const cur = profileRef.current;
    saveProfile(cur);
    savePortfolioEntry(cur);
    if (cloudUser) {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      await saveBusinessProfile({ data: { profile: cur, industry: cur.industry } }).catch(
        () => undefined,
      );
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
            if (!next || new Date(remote.profile.updatedAt) >= new Date(next.updatedAt))
              next = remote.profile;
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
      template,
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
      resetSegregationToDerived,
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
    }),
    [
      profile,
      ready,
      syncStatus,
      template,
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
      resetSegregationToDerived,
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
      // eslint-disable-next-line react-hooks/exhaustive-deps
      historyVersion,
    ],
  );

  return <PracticeContext.Provider value={value}>{children}</PracticeContext.Provider>;
}

const DEMO_NAMES = new Set(INDUSTRIES.map((i) => i.demoName));

export function usePractice() {
  const ctx = useContext(PracticeContext);
  if (!ctx) throw new Error("usePractice requires PracticeProvider");
  return ctx;
}
