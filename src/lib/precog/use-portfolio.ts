import { useCallback, useMemo, useRef, type Dispatch, type MutableRefObject } from "react";
import type { IndustryId } from "./industry";
import { deleteBusiness as deleteBusinessRemote, loadBusiness } from "./profile-server";
import { localDateKey } from "./decisions/follow-through";
import {
  loadPortfolio,
  normalizeProfile,
  removePortfolioEntry,
  savePortfolioEntry,
  summarizeBusiness,
  type BusinessSummary,
  type PracticeProfile,
} from "./practice-profile";
import { removeValueProof } from "./value-proof-store";
import {
  atBusinessLimit,
  MAX_BUSINESSES_PER_ACCOUNT,
  newBusinessProfile,
  ownSetupProfile,
  sampleSetupProfile,
  unfinishedBusinessToKeep,
} from "./business-lifecycle";
import type { Departure } from "./continuity/access-removal";
import type { Person } from "./types";
import type { LocalProfileStore } from "./save-conflict";
import type { SaveConflictState } from "./use-cloud-sync";
import type { ProfileAction } from "./profile-reducer";
import { withRosterLeavers } from "./profile-actions";

/**
 * More than one business per account: the list, switching between them,
 * adding one through setup, and removing one. Setup itself (the sample or
 * the owner's own team) lives here too, because both retire the unfinished
 * business the setup dialog sat on.
 */
export function usePortfolio(input: {
  profile: PracticeProfile;
  profileRef: MutableRefObject<PracticeProfile>;
  setProfile: Dispatch<ProfileAction>;
  activateProfile: (next: PracticeProfile) => void;
  clearHistory: () => void;
  localStore: LocalProfileStore;
  cloudUser: boolean;
  cloudRevision: MutableRefObject<Map<string, number>>;
  saveConflictRef: MutableRefObject<SaveConflictState | null>;
  flushActive: () => Promise<boolean>;
  remoteBusinesses: BusinessSummary[];
  setRemoteBusinesses: Dispatch<(cur: BusinessSummary[]) => BusinessSummary[]>;
  portfolioVersion: number;
  bumpPortfolio: () => void;
  setSwitching: (on: boolean) => void;
}) {
  const {
    profile,
    profileRef,
    setProfile,
    activateProfile,
    clearHistory,
    localStore,
    cloudUser,
    cloudRevision,
    saveConflictRef,
    flushActive,
    remoteBusinesses,
    setRemoteBusinesses,
    portfolioVersion,
    bumpPortfolio,
    setSwitching,
  } = input;
  // The business open before "Add a business", which cancelling setup returns to.
  const openBeforeSetup = useRef<string | null>(null);

  /** Local portfolio + cloud summaries merged by id; the active business always wins. */
  const businesses = useMemo<BusinessSummary[]>(() => {
    const byId = new Map<string, BusinessSummary>();
    for (const b of remoteBusinesses) byId.set(b.id, b);
    for (const p of Object.values(loadPortfolio())) {
      // An unfinished setup saved by an older version is the sample, not a business.
      if (p.onboardingComplete === false) continue;
      const s = summarizeBusiness(p);
      const existing = byId.get(s.id);
      if (!existing || new Date(s.updatedAt) >= new Date(existing.updatedAt)) byId.set(s.id, s);
    }
    byId.set(profile.businessId ?? "biz_default", summarizeBusiness(profile));
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- portfolioVersion tracks storage writes
  }, [
    remoteBusinesses,
    profile.businessId,
    profile.practiceName,
    profile.industry,
    portfolioVersion,
  ]);

  const switchBusiness = useCallback(
    async (id: string) => {
      if (id === (profileRef.current.businessId ?? "biz_default")) return;
      setSwitching(true);
      try {
        if (!(await flushActive())) return;
        let next: PracticeProfile | null = loadPortfolio()[id] ?? null;
        // Another tab may have this business open: its copy of the open
        // business is written on every edit, the portfolio only a moment
        // later, so take whichever is newer.
        const open = localStore.peek(id);
        if (open && (!next || open.profile.updatedAt >= next.updatedAt)) next = open.profile;
        if (cloudUser) {
          const remote = await loadBusiness({
            data: { id, today: localDateKey(new Date()) },
          }).catch(() => null);
          if (remote?.found && remote.profile) {
            // The local copy is only trustworthy if it was built on the
            // revision the server still holds; any newer revision means
            // another device wrote since, and clocks are not a tiebreaker.
            const seen = cloudRevision.current.get(id);
            const localCurrent = next !== null && seen !== undefined && seen === remote.revision;
            cloudRevision.current.set(id, remote.revision);
            if (!localCurrent) next = normalizeProfile(remote.profile);
          } else if (remote?.found === false) {
            cloudRevision.current.delete(id);
          }
        }
        if (!next) return;
        activateProfile({ ...next, businessId: id, onboardingComplete: true });
      } finally {
        setSwitching(false);
      }
    },
    [activateProfile, cloudUser, flushActive, localStore, cloudRevision, profileRef, setSwitching],
  );

  const createBusiness = useCallback(
    (industry: IndustryId, name?: string): { ok: true } | { ok: false; reason: string } => {
      // A conflict on the outgoing business must not be lost behind the new
      // one: the banner stays up and the switch waits for the user's choice.
      if (saveConflictRef.current) {
        return {
          ok: false,
          reason: "Choose a version in the banner at the top first, so no work is lost.",
        };
      }
      if (cloudUser && atBusinessLimit(businesses.length)) {
        return {
          ok: false,
          reason: `Your account already holds ${MAX_BUSINESSES_PER_ACCOUNT} businesses, the most it can keep. Remove one you no longer need first.`,
        };
      }
      const current = profileRef.current;
      if (current.onboardingComplete !== false) {
        openBeforeSetup.current = current.businessId ?? "biz_default";
      }
      void flushActive();
      // Setup opens for it: the owner's own team, or the sample under the
      // sample's name. It never shows the sample's people under this name.
      const next = newBusinessProfile(industry, name);
      cloudRevision.current.delete(next.businessId as string);
      activateProfile(next);
      return { ok: true };
    },
    [
      activateProfile,
      flushActive,
      cloudUser,
      businesses.length,
      saveConflictRef,
      cloudRevision,
      profileRef,
    ],
  );

  // Where "Cancel" in the setup dialog goes: the business open before it,
  // else the most recently changed one; none on a first visit.
  const setupReturnsTo = useMemo<BusinessSummary | null>(() => {
    if (profile.onboardingComplete !== false) return null;
    const activeId = profile.businessId ?? "biz_default";
    const others = businesses.filter((b) => b.id !== activeId);
    return (
      others.find((b) => b.id === openBeforeSetup.current) ??
      [...others].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ??
      null
    );
  }, [businesses, profile.onboardingComplete, profile.businessId]);

  const cancelSetup = useCallback(async () => {
    if (!setupReturnsTo) return;
    openBeforeSetup.current = null;
    await switchBusiness(setupReturnsTo.id);
  }, [setupReturnsTo, switchBusiness]);

  /**
   * The unfinished business a setup replaces goes away (it is only the
   * sample behind the dialog), unless an older version of the app saved real
   * work under it; then it stays as a business of its own.
   */
  const retireUnfinished = useCallback(
    (previous: PracticeProfile) => {
      const keep = unfinishedBusinessToKeep(previous);
      const id = previous.businessId ?? "biz_default";
      if (keep) savePortfolioEntry(keep);
      // Older versions listed the unfinished sample in the portfolio; a finished
      // business under the same id (another tab's) is left alone.
      else if (loadPortfolio()[id]?.onboardingComplete === false) removePortfolioEntry(id);
      bumpPortfolio();
    },
    [bumpPortfolio],
  );

  const completeOnboarding = useCallback(
    (industry: IndustryId) => {
      clearHistory();
      const previous = profileRef.current;
      if (previous.onboardingComplete === false) retireUnfinished(previous);
      openBeforeSetup.current = null;
      setProfile((p) => sampleSetupProfile(industry, p));
    },
    [clearHistory, retireUnfinished, profileRef, setProfile],
  );

  const startOwnBusiness = useCallback(
    (input: {
      industry: IndustryId;
      practiceName: string;
      people: Person[];
      leftOut?: Departure[];
    }) => {
      clearHistory();
      const previous = profileRef.current;
      if (previous.onboardingComplete === false) retireUnfinished(previous);
      openBeforeSetup.current = null;
      setProfile(() =>
        withRosterLeavers(ownSetupProfile(input), input.people, input.leftOut ?? []),
      );
    },
    [clearHistory, retireUnfinished, profileRef, setProfile],
  );

  const deleteBusiness = useCallback(
    async (id: string) => {
      const activeId = profileRef.current.businessId ?? "biz_default";
      if (id === activeId) return;
      removePortfolioEntry(id);
      removeValueProof(id);
      setRemoteBusinesses((cur) => cur.filter((b) => b.id !== id));
      bumpPortfolio();
      if (cloudUser) await deleteBusinessRemote({ data: { id } }).catch(() => undefined);
    },
    [cloudUser, profileRef, setRemoteBusinesses, bumpPortfolio],
  );

  return {
    businesses,
    switchBusiness,
    createBusiness,
    deleteBusiness,
    setupReturnsTo,
    cancelSetup,
    completeOnboarding,
    startOwnBusiness,
  };
}
