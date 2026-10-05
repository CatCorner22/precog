import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type MutableRefObject,
} from "react";
import { toast } from "sonner";
import type { IndustryId } from "./industry";
import { deleteBusiness as deleteBusinessRemote, loadBusiness } from "./profile-server";
import { getEntitlements, type EntitlementsAnswer } from "./firm/entitlements-server";
import {
  loadPortfolio,
  removePortfolioEntry,
  savePortfolioEntry,
  summarizeBusiness,
  type BusinessSummary,
  type PracticeProfile,
} from "./practice-profile";
import { removeValueProof } from "./value-proof-store";
import { downloadRecoveryCopy } from "./recovery-copy";
import {
  atBusinessLimit,
  businessLimitMessage,
  newBusinessProfile,
  ownSetupProfile,
  sampleSetupProfile,
  unfinishedBusinessToKeep,
} from "./business-lifecycle";
import type { Departure } from "./continuity/access-removal";
import type { Person } from "./types";
import { pickSwitchCopy, type LocalProfileStore } from "./save-conflict";
import type { SaveConflictState } from "./use-cloud-sync";
import type { ProfileAction } from "./profile-reducer";
import type { Workspace } from "./workspace-context";
import { withRosterLeavers } from "./profile-actions";
import { localDateKey } from "./dates";
import { DEFAULT_BUSINESS_ID } from "./business-id";

/** Whether a switch opened the business, and when not, what to tell the owner. */
export type SwitchResult = { ok: true } | { ok: false; reason: string };

/**
 * More than one business per account: the list, switching between them,
 * adding one through setup, and removing one. Setup itself (the sample or
 * the owner's own team) lives here too, because both retire the unfinished
 * business the setup dialog sat on.
 */
export function usePortfolio(input: {
  workspace: Workspace;
  profile: PracticeProfile;
  profileRef: MutableRefObject<PracticeProfile>;
  setProfile: Dispatch<ProfileAction>;
  activateProfile: (next: PracticeProfile) => void;
  clearHistory: () => void;
  localStore: LocalProfileStore;
  cloudUser: boolean;
  cloudRevision: MutableRefObject<Map<string, number>>;
  saveConflictRef: MutableRefObject<SaveConflictState | null>;
  raiseConflict: (conflict: SaveConflictState) => void;
  /** Whether the account took this device's copy of the business stamped `stamp`. */
  accountTook: (id: string, stamp: string) => boolean;
  flushLocal: () => boolean;
  flushActive: () => Promise<boolean>;
  openedFromAccount: (opened: PracticeProfile, revision: number) => void;
  remoteBusinesses: BusinessSummary[];
  setRemoteBusinesses: Dispatch<(cur: BusinessSummary[]) => BusinessSummary[]>;
  portfolioVersion: number;
  bumpPortfolio: () => void;
  setSwitching: (on: boolean) => void;
}) {
  const {
    workspace,
    profile,
    profileRef,
    setProfile,
    activateProfile,
    clearHistory,
    localStore,
    cloudUser,
    cloudRevision,
    saveConflictRef,
    raiseConflict,
    accountTook,
    flushLocal,
    flushActive,
    openedFromAccount,
    remoteBusinesses,
    setRemoteBusinesses,
    portfolioVersion,
    bumpPortfolio,
    setSwitching,
  } = input;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // The business open before "Add a business", which cancelling setup returns to.
  const openBeforeSetup = useRef<string | null>(null);
  // The plan's client limit, read from the account the first time a signed-in
  // owner adds a business (never at mount, so a signed-out visitor sends
  // nothing) and again after each business created.
  const entitlements = useRef<Promise<EntitlementsAnswer | null> | null>(null);

  /** Local portfolio + cloud summaries merged by id; the active business always wins. */
  const businesses = useMemo<BusinessSummary[]>(() => {
    const byId = new Map<string, BusinessSummary>();
    for (const b of remoteBusinesses) byId.set(b.id, b);
    for (const p of Object.values(loadPortfolio(workspace.local))) {
      // An unfinished setup saved by an older version is the sample, not a business.
      if (p.onboardingComplete === false) continue;
      const s = summarizeBusiness(p);
      const existing = byId.get(s.id);
      if (!existing || new Date(s.updatedAt) >= new Date(existing.updatedAt))
        byId.set(s.id, { ...s, shared: existing?.shared, firmClient: existing?.firmClient });
    }
    const activeId = profile.businessId ?? DEFAULT_BUSINESS_ID;
    const active = byId.get(activeId);
    byId.set(activeId, {
      ...summarizeBusiness(profile),
      shared: active?.shared,
      firmClient: active?.firmClient,
    });
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- portfolioVersion tracks storage writes
  }, [
    remoteBusinesses,
    profile.businessId,
    profile.practiceName,
    profile.industry,
    portfolioVersion,
    workspace.local,
  ]);

  const switchBusiness = useCallback(
    async (id: string): Promise<SwitchResult> => {
      if (id === (profileRef.current.businessId ?? DEFAULT_BUSINESS_ID)) return { ok: true };
      setSwitching(true);
      try {
        if (!(await flushActive()))
          return {
            ok: false,
            reason: saveConflictRef.current
              ? CHOOSE_A_VERSION_FIRST
              : "Precog could not save the open business, so it stays open.",
          };
        if (!mounted.current) return { ok: false, reason: "The page closed before the switch." };
        const remote = cloudUser
          ? await loadBusiness({ data: { id, today: localDateKey(new Date()) } }).catch(
              () => "unreachable" as const,
            )
          : null;
        const copy = pickSwitchCopy({
          stored: loadPortfolio(workspace.local)[id],
          open: localStore.peek(id)?.profile ?? null,
          account:
            remote === "unreachable" || remote === null
              ? remote
              : remote.found && remote.profile
                ? { found: true, profile: remote.profile, revision: remote.revision }
                : remote.found === false
                  ? { found: false }
                  : null,
          seenRevision: cloudRevision.current.get(id),
          heldByAccount: cloudRevision.current.has(id) || remoteBusinesses.some((b) => b.id === id),
          accountTook: (stamp) => accountTook(id, stamp),
        });
        if (!copy.ok) return copy;
        if (!mounted.current) return { ok: false, reason: "The page closed before the switch." };
        const opened = { ...copy.profile, businessId: id, onboardingComplete: true };
        if (copy.accountMovedOn) {
          // This device's copy opens with the banner up, as when a save is
          // refused: the owner chooses, and the other copy is kept.
          const { profile: theirs, revision } = copy.accountMovedOn;
          raiseConflict({
            reason: "remote-edit",
            businessId: id,
            remote: { ...theirs, businessId: id },
            revision,
            updatedAt: theirs.updatedAt,
          });
          activateProfile(opened);
          return { ok: true };
        }
        if (copy.accountRevision !== null) openedFromAccount(opened, copy.accountRevision);
        // Its next save creates it in the account.
        if (copy.localOnly) cloudRevision.current.delete(id);
        activateProfile(opened);
        return { ok: true };
      } finally {
        setSwitching(false);
      }
    },
    [
      activateProfile,
      accountTook,
      cloudUser,
      flushActive,
      openedFromAccount,
      raiseConflict,
      localStore,
      cloudRevision,
      remoteBusinesses,
      profileRef,
      saveConflictRef,
      setSwitching,
      workspace.local,
    ],
  );

  const createBusiness = useCallback(
    async (industry: IndustryId, name?: string): Promise<SwitchResult> => {
      // A conflict on the outgoing business must not be lost behind the new
      // one: the banner stays up and the switch waits for the user's choice.
      if (saveConflictRef.current) return { ok: false, reason: CHOOSE_A_VERSION_FIRST };
      if (cloudUser) {
        entitlements.current ??= getEntitlements().catch(() => null);
        const plan = await entitlements.current;
        if (plan) {
          if (plan.clientCount >= plan.clientLimit) {
            return {
              ok: false,
              reason: businessLimitMessage({ plan: plan.plan, limit: plan.clientLimit }),
            };
          }
        } else if (atBusinessLimit(businesses.length)) {
          return { ok: false, reason: businessLimitMessage() };
        }
      }
      // Written here first: another tab's newer save raises the banner now,
      // before the new business takes this one's place.
      if (!flushLocal())
        return {
          ok: false,
          reason: saveConflictRef.current ? CHOOSE_A_VERSION_FIRST : NOT_KEPT_HERE,
        };
      const current = profileRef.current;
      if (current.onboardingComplete !== false) {
        openBeforeSetup.current = current.businessId ?? DEFAULT_BUSINESS_ID;
      }
      setSwitching(true);
      try {
        // The account may refuse the save of this business (another device
        // saved it meanwhile). The banner then sits on this business, still
        // open, rather than on the new one. A save that fails for any other
        // reason stays on this device and does not stop the new business.
        await flushActive();
        if (saveConflictRef.current) return { ok: false, reason: CHOOSE_A_VERSION_FIRST };
        if (!mounted.current) return { ok: false, reason: "The page closed before the switch." };
        // An edit made while the account save was in flight.
        if (!flushLocal())
          return {
            ok: false,
            reason: saveConflictRef.current ? CHOOSE_A_VERSION_FIRST : NOT_KEPT_HERE,
          };
        // Setup opens for it: the owner's own team, or the sample under the
        // sample's name. It never shows the sample's people under this name.
        const next = newBusinessProfile(industry, name);
        cloudRevision.current.delete(next.businessId as string);
        activateProfile(next);
        // The count moves once this one is saved, so the next add reads it again.
        entitlements.current = null;
        return { ok: true };
      } finally {
        setSwitching(false);
      }
    },
    [
      activateProfile,
      setSwitching,
      flushLocal,
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
    const activeId = profile.businessId ?? DEFAULT_BUSINESS_ID;
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
    const result = await switchBusiness(setupReturnsTo.id);
    if (!result.ok)
      toast.error(`Could not open ${setupReturnsTo.name}`, { description: result.reason });
  }, [setupReturnsTo, switchBusiness]);

  /**
   * The unfinished business a setup replaces goes away (it is only the
   * sample behind the dialog), unless an older version of the app saved real
   * work under it; then it stays as a business of its own.
   */
  const retireUnfinished = useCallback(
    (previous: PracticeProfile) => {
      const keep = unfinishedBusinessToKeep(previous);
      const id = previous.businessId ?? DEFAULT_BUSINESS_ID;
      if (keep) {
        // The setup about to open takes its place, so a copy this browser
        // refused leaves as a file rather than nowhere.
        if (!savePortfolioEntry(keep, workspace.local))
          toast.error(`This browser did not keep ${keep.practiceName}`, {
            description:
              "Storage on this device is full or blocked. Download this copy to keep it.",
            duration: Infinity,
            action: {
              label: "Download this copy",
              onClick: () => downloadRecoveryCopy(workspace, keep),
            },
          });
      }
      // Older versions listed the unfinished sample in the portfolio; a finished
      // business under the same id (another tab's) is left alone.
      else if (loadPortfolio(workspace.local)[id]?.onboardingComplete === false)
        removePortfolioEntry(id, workspace.local);
      bumpPortfolio();
    },
    [bumpPortfolio, workspace],
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
      onboardingFacts?: import("./onboarding/decision-model").OnboardingFacts;
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
      const activeId = profileRef.current.businessId ?? DEFAULT_BUSINESS_ID;
      if (id === activeId) return;
      if (cloudUser)
        await deleteBusinessRemote({ data: { id, expectedAccountId: workspace.accountId ?? "" } });
      if (!mounted.current) return;
      removePortfolioEntry(id, workspace.local);
      removeValueProof(id, workspace.local);
      setRemoteBusinesses((cur) => cur.filter((b) => b.id !== id));
      bumpPortfolio();
    },
    [cloudUser, profileRef, setRemoteBusinesses, bumpPortfolio, workspace],
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

const CHOOSE_A_VERSION_FIRST = "Choose a copy in the banner at the top first, so you lose no work.";
/** This browser refused the open business, which exists nowhere else yet. */
const NOT_KEPT_HERE =
  "This browser did not keep the open business, so it stays open until storage on this device frees up.";
