import type { EntitlementId } from "../sod/conflict-rules";
import type { Person } from "../types";
import type { IndustrySector } from "../evidence/types";

export type IndustryPackId =
  | "dental"
  | "medical"
  | "restaurant"
  | "construction"
  | "professional-services"
  | "retail"
  | "nonprofit";

/**
 * An industry pack.
 *
 * The duty vocabulary underneath — who collects money, who records it, who
 * approves payments, who reconciles the bank — does not change between a
 * dental practice and a restaurant. What changes is what people call those
 * duties, which roles hold them, and which schemes the trade attracts.
 *
 * A pack therefore supplies wording, role templates, and a starting team; the
 * conflict rules and the scoring engine stay shared. That is deliberate: a
 * fake-vendor scheme works identically in a dental office and a restaurant,
 * and splitting the rules per industry would multiply maintenance while making
 * the findings less comparable, not more accurate.
 */
export interface IndustryPack {
  id: IndustryPackId;
  /** What an owner would call their own business. */
  label: string;
  blurb: string;
  /** Joins this pack to the real-case library. */
  sector: IndustrySector;
  /**
   * Trade wording for duties. Anything omitted falls back to the shared label.
   * "Post payments in the practice-management system" means nothing behind a
   * bar; "Record payments in the POS" does.
   */
  entitlementLabels: Partial<Record<EntitlementId, string>>;
  /** Typical roles in this trade and the duties each usually carries. */
  roleTemplates: Record<string, EntitlementId[]>;
  /** A representative team, so the app shows something real immediately. */
  people: Person[];
  /** Sample business name, used only while the profile still carries a sample name. */
  sampleName: string;
  /**
   * What goes wrong in this trade specifically, drawn from the case library
   * rather than from a generic control checklist.
   */
  watchFor: string[];
}
