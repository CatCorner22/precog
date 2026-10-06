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
  ACTIVE_PROFILE_KEY,
  loadPortfolio,
  businessSummaryKey,
  forgetRemovedBusiness,
  rememberRemovedBusiness,
  removePortfolioEntry,
  savePortfolioEntry,
  summarizeBusiness,
  type BusinessSummary,
  type PracticeProfile,
} from "./practice-profile";
import { removeValueProof } from "./value-proof-store";
import { removeLocal } from "./local-data";
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
import type { SetupAnswers } from "./onboarding/setup-answers";
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

  /**
   * Local portfolio + cloud summaries merged by owner and id; the active
   * business always wins. `loadPortfolio` normalises each stored entry and
   * skips (and quarantines) one it cannot read, so one damaged entry never
   * stops the list.
   */
  const businesses = useMemo<BusinessSummary[]>(() => {
    const byId = new Map<string, BusinessSummary>();
    for (const b of remoteBusinesses) byId.set(businessSummaryKey(b, workspace.accountId), b);
    for (const p of Object.values(loadPortfolio(workspace.local))) {
      // An unfinished setup saved by an older version is the sample, not a business.
      if (p.onboardingComplete === false) continue;
      const s = summarizeBusiness(p);
      const key = businessSummaryKey(s, workspace.accountId);
      const existing = byId.get(key);
      if (!existing || new Date(s.updatedAt) >= new Date(existing.updatedAt))
        byId.set(key, {
          ...s,
          ownerUserId: existing?.ownerUserId,
          shared: existing?.shared,
          firmClient: existing?.firmClient,
        });
    }
    const activeId = profile.businessId ?? DEFAULT_BUSINESS_ID;
    const activeKey = businessSummaryKey(
      { id: activeId, ownerUserId: profile.ownerUserId },
      workspace.accountId,
    );
    const active = byId.get(activeKey);
    byId.set(activeKey, {
      ...summarizeBusiness(profile),
      ownerUserId: profile.ownerUserId ?? active?.ownerUserId,
      shared: active?.shared,
      firmClient: active?.firmClient,
    });
    return [...byId.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
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
    async (id: string, ownerUserId?: string): Promise<SwitchResult> => {
      const current = profileRef.current;
      if (
        businessSummaryKey({ id, ownerUserId }, workspace.accountId) ===
        businessSummaryKey(
          { id: current.businessId ?? DEFAULT_BUSINESS_ID, ownerUserId: current.ownerUserId },
          workspace.accountId,
        )
      )
        return { ok: true };
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
          ? await loadBusiness({
              data: { id, ownerUserId, today: localDateKey(new Date()) },
            }).catch(() => "unreachable" as const)
          : null;
        const ownOrLocal = !ownerUserId || ownerUserId === workspace.accountId;
        const copy = pickSwitchCopy({
          stored: ownOrLocal ? loadPortfolio(workspace.local)[id] : undefined,
          open: ownOrLocal ? (localStore.peek(id)?.profile ?? null) : null,
          account:
            remote === "unreachable" || remote === null
              ? remote
              : remote.found && remote.profile
                ? { found: true, profile: remote.profile, revision: remote.revision }
                : remote.found === false
                  ? { found: false }
                  : null,
          seenRevision: cloudRevision.current.get(id),
          heldByAccount:
            cloudRevision.current.has(id) ||
            remoteBusinesses.some((b) => b.id === id && b.ownerUserId === ownerUserId),
          accountTook: (stamp) => accountTook(id, stamp),
        });
        if (!copy.ok) return copy;
        if (!mounted.current) return { ok: false, reason: "The page closed before the switch." };
        // An edit made while the account load was in flight: written now, or
        // the business stays open, since opening the next one would drop it.
        if (!flushLocal())
          return {
            ok: false,
            reason: saveConflictRef.current ? CHOOSE_A_VERSION_FIRST : NOT_SAVED_ON_SWITCH,
          };
        const opened = {
          ...copy.profile,
          businessId: id,
          ownerUserId: ownerUserId ?? copy.profile.ownerUserId,
          onboardingComplete: true,
        };
        // The account holds it live (restored after a removal on this
        // device): it is listed and kept here again.
        if (ownOrLocal && (copy.accountRevision !== null || copy.accountMovedOn)) {
          if (forgetRemovedBusiness(id, workspace.local)) bumpPortfolio();
        }
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
      bumpPortfolio,
      cloudUser,
      flushActive,
      flushLocal,
      openedFromAccount,
      raiseConflict,
      localStore,
      cloudRevision,
      remoteBusinesses,
      profileRef,
      saveConflictRef,
      setSwitching,
      workspace.accountId,
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
    const result = await switchBusiness(setupReturnsTo.id, setupReturnsTo.ownerUserId);
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
      answers?: SetupAnswers;
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
    async (id: string, ownerUserId?: string) => {
      const active = profileRef.current;
      if (
        businessSummaryKey({ id, ownerUserId }, workspace.accountId) ===
        businessSummaryKey(
          { id: active.businessId ?? DEFAULT_BUSINESS_ID, ownerUserId: active.ownerUserId },
          workspace.accountId,
        )
      )
        return;
      if (cloudUser)
        await deleteBusinessRemote({
          data: { id, ownerUserId, expectedAccountId: workspace.accountId ?? "" },
        });
      if (!mounted.current) return;
      if (!ownerUserId || ownerUserId === workspace.accountId) {
        // Remembered first: a tab still open on it does not list it again.
        rememberRemovedBusiness(id, workspace.local);
        removePortfolioEntry(id, workspace.local);
        removeValueProof(id, workspace.local);
        // The open business another tab left here: a reload opens this
        // tab's business instead, not the removed one.
        if (localStore.peek(id)) {
          const mine = profileRef.current;
          const wrote =
            saveConflictRef.current?.reason !== "other-tab" &&
            localStore.write(mine).kind === "saved";
          if (!wrote) removeLocal(ACTIVE_PROFILE_KEY, workspace.local);
        }
      }
      setRemoteBusinesses((cur) =>
        cur.filter((b) => !(b.id === id && b.ownerUserId === ownerUserId)),
      );
      bumpPortfolio();
    },
    [
      cloudUser,
      localStore,
      profileRef,
      saveConflictRef,
      setRemoteBusinesses,
      bumpPortfolio,
      workspace,
    ],
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
/** An edit made during a switch could not be written, so the switch stops. */
export const NOT_SAVED_ON_SWITCH =
  "Precog could not save this business on this device, so it stayed open. Download a recovery copy, then try again.";
