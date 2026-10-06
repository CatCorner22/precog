/**
 * The duty assignments the owner last accepted, kept per business in this
 * browser. Change review on Team compares today's duties against it, and
 * Reset duties on Duty assignments goes back to it.
 */
import { DEFAULT_BUSINESS_ID } from "../business-id";
import type { RoleAssignment } from "./detect";
import { normalizeRoleAssignments } from "./model-io";

interface BaselineStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** `precog.power-map-baseline.v1:{businessId}`, unchanged since the Duty assignments view held it. */
export function dutyBaselineKey(businessId: string | undefined): string {
  return `precog.power-map-baseline.v1:${businessId ?? DEFAULT_BUSINESS_ID}`;
}

/** The stored baseline, or undefined when none is stored or it cannot be read. */
export function readDutyBaseline(
  storage: BaselineStorage | null | undefined,
  businessId: string | undefined,
): RoleAssignment[] | undefined {
  try {
    const stored = storage?.getItem(dutyBaselineKey(businessId));
    return stored ? normalizeRoleAssignments(JSON.parse(stored)) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Whether a baseline is stored for the business, readable or not. A stored
 * one that `readDutyBaseline` cannot read is not the same as none: today's
 * duties are not the accepted ones.
 */
export function hasStoredDutyBaseline(
  storage: BaselineStorage | null | undefined,
  businessId: string | undefined,
): boolean {
  try {
    return Boolean(storage?.getItem(dutyBaselineKey(businessId)));
  } catch {
    return false;
  }
}

/** What Change review says when the stored baseline cannot be read. */
export const UNREADABLE_BASELINE_MESSAGE =
  "Your accepted duty baseline could not be read. Accept the current duties again to restart change review.";

/**
 * Store `assignments` as the baseline when none is stored yet, and leave a
 * stored one alone. A screen that changes duties away from Team calls this
 * before its change, so Change review lists that change instead of taking
 * the changed duties as the starting point. Returns true when it stored one.
 */
export function seedDutyBaseline(
  storage: BaselineStorage | null | undefined,
  businessId: string | undefined,
  assignments: RoleAssignment[],
): boolean {
  try {
    if (!storage) return false;
    const key = dutyBaselineKey(businessId);
    if (storage.getItem(key) !== null) return false;
    storage.setItem(key, JSON.stringify(assignments));
    return true;
  } catch {
    return false;
  }
}

/** Replace the stored baseline: the owner accepted today's duties. */
export function storeDutyBaseline(
  storage: BaselineStorage | null | undefined,
  businessId: string | undefined,
  assignments: RoleAssignment[],
): void {
  try {
    storage?.setItem(dutyBaselineKey(businessId), JSON.stringify(assignments));
  } catch {
    /* storage unavailable */
  }
}
