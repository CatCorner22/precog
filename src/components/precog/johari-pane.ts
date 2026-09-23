import type { IndustryId } from "@/lib/precog/industry";

/**
 * Heading for the playbook's worked examples, which are written for a
 * dental office: said plainly, and for other businesses with a note that the
 * same patterns occur in any business.
 */
export function examplesHeading(industry: IndustryId): string {
  return industry === "dental"
    ? "Examples from a dental or medical office"
    : "Examples from a dental office · the same patterns occur in any business";
}
