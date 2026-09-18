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
import type { StaffComposition } from "./types";
import type { RiskVariableState } from "./scoring/dynamic-variables";
import {
  mergeDualReleasePolicy,
  staffFlagsFromDualRelease,
  type DualReleasePolicy,
} from "./controls/dual-release";
import { INDUSTRIES, industryMeta, type IndustryId } from "./industry";
import {
  loadBusinessProfile,
  saveBusinessProfile,
} from "./profile-server";
import { setActiveIndustry } from "./active-template";
import { getIndustryTemplate } from "./templates";
import {
  defaultProfile,
  loadProfile,
  makeDecisionId,
  saveProfile,
  type DecisionEntry,
  type DecisionKind,
  type PracticeProfile,
} from "./practice-profile";

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
}

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

  // Bootstrap: local first, then cloud when signed in
  useEffect(() => {
    const loaded = loadProfile();
    setActiveIndustry(loaded.industry);
    setTemplateRevision((r) => r + 1);
    setProfile(loaded);
    setReady(true);
  }, []);

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
    void loadBusinessProfile()
      .then((res) => {
        if (cancelled) return;
        cloudLoadedFor.current = user.id;
        if (res.found && res.profile) {
          setActiveIndustry(res.profile.industry);
          setTemplateRevision((r) => r + 1);
          setProfile(res.profile);
          saveProfile(res.profile);
        }
        setSyncStatus("synced");
      })
      .catch(() => {
        if (!cancelled) setSyncStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [ready, isPending, user?.id, user?.isDevFallback]);

  // Persist locally + debounced cloud save
  useEffect(() => {
    if (!ready) return;
    saveProfile(profile);

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

  const setIndustry = useCallback((industry: IndustryId) => {
    setActiveIndustry(industry);
    setTemplateRevision((r) => r + 1);
    const meta = industryMeta(industry);
    const tpl = getIndustryTemplate(industry);
    const staff = { ...tpl.staffComposition };
    const fresh = defaultProfile(industry);
    setProfile((p) => ({
      ...fresh,
      practiceName: DEMO_NAMES.has(p.practiceName) ? meta.demoName : p.practiceName,
      decisions: p.decisions,
    }));
  }, []);

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
    setProfile((p) => {
      setActiveIndustry(p.industry);
      setTemplateRevision((r) => r + 1);
      return defaultProfile(p.industry);
    });
  }, []);

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
