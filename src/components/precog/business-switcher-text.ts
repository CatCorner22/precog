import { DELETED_RETENTION_DAYS } from "@/lib/precog/business-retention";
import type { BusinessSummary } from "@/lib/precog/practice-profile";

/**
 * Asked before the trash button removes a business. A firm client is one row
 * the whole firm shares, and the server lets any firm member delete it, so
 * the prompt says it goes for everyone and how a member brings it back.
 */
export function removeBusinessPrompt(b: Pick<BusinessSummary, "name" | "shared">): string {
  if (b.shared) {
    return `Delete "${b.name}" for everyone in your firm? Precog removes it from every firm member's list, and its share links stop working. Anyone in your firm can restore it under Recently deleted in the Firm workspace for ${DELETED_RETENTION_DAYS} days.`;
  }
  return `Remove "${b.name}" from your portfolio? Its share links stop working. You cannot undo this.`;
}
