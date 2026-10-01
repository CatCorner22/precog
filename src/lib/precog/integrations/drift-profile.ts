import type { PracticeProfile } from "../practice-profile";
import type { IntegrationDrift } from "./qbo/model";
import {
  mergeDriftSummary,
  summarizeAccessReconciliation,
  summarizeQboDrift,
  type IntegrationDriftSummary,
} from "./drift-summary";

/** Recompute the compact drift snapshot stored on the business profile. */
export function refreshIntegrationDriftSummary(
  profile: Pick<PracticeProfile, "integrationDriftSummary" | "accessReconciliation">,
  qboDrift?: IntegrationDrift | null,
): IntegrationDriftSummary | undefined {
  const qbo =
    qboDrift !== undefined
      ? summarizeQboDrift(qboDrift)
      : profile.integrationDriftSummary?.source === "access"
        ? null
        : (profile.integrationDriftSummary ?? null);
  const access = summarizeAccessReconciliation(profile.accessReconciliation, qbo ?? null);
  if (qboDrift !== undefined) {
    return mergeDriftSummary(qbo, access) ?? undefined;
  }
  return access ?? profile.integrationDriftSummary ?? undefined;
}
