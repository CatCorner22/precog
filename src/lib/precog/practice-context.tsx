import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { StaffComposition } from "./types";
import type { RiskVariableState } from "./scoring/dynamic-variables";
import {
  defaultProfile,
  loadProfile,
  makeDecisionId,
  saveProfile,
  type DecisionEntry,
  type DecisionKind,
  type PracticeProfile,
} from "./practice-profile";

interface PracticeContextValue {
  profile: PracticeProfile;
  ready: boolean;
  setPracticeName: (name: string) => void;
  setStaff: (staff: StaffComposition | ((s: StaffComposition) => StaffComposition)) => void;
  setRiskVariables: (
    v: RiskVariableState | ((r: RiskVariableState) => RiskVariableState),
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

export function PracticeProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<PracticeProfile>(defaultProfile);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setProfile(loadProfile());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    saveProfile(profile);
  }, [profile, ready]);

  const setPracticeName = useCallback((name: string) => {
    setProfile((p) => ({ ...p, practiceName: name.slice(0, 80) }));
  }, []);

  const setStaff = useCallback(
    (staff: StaffComposition | ((s: StaffComposition) => StaffComposition)) => {
      setProfile((p) => {
        const next = typeof staff === "function" ? staff(p.staff) : staff;
        return {
          ...p,
          staff: next,
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
    setProfile(defaultProfile());
  }, []);

  const value = useMemo(
    () => ({
      profile,
      ready,
      setPracticeName,
      setStaff,
      setRiskVariables,
      addDecision,
      removeDecision,
      resetProfile,
    }),
    [
      profile,
      ready,
      setPracticeName,
      setStaff,
      setRiskVariables,
      addDecision,
      removeDecision,
      resetProfile,
    ],
  );

  return (
    <PracticeContext.Provider value={value}>{children}</PracticeContext.Provider>
  );
}

export function usePractice() {
  const ctx = useContext(PracticeContext);
  if (!ctx) throw new Error("usePractice requires PracticeProvider");
  return ctx;
}
