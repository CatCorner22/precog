import { DEFAULT_INDUSTRY, type IndustryId } from "../industry";
import type { IndustrySample } from "./types";
import { dentalTemplate } from "./dental";
import { retailTemplate } from "./retail";
import { professionalServicesTemplate } from "./professional-services";
import { restaurantTemplate } from "./restaurant";
import { constructionTemplate } from "./construction";
import { automotiveTemplate } from "./automotive";
import { nonprofitTemplate } from "./nonprofit";
import { generalTemplate } from "./general";

/**
 * The sample businesses as their files write them, keyed by industry. This
 * module imports only the sample files, so an engine that needs to tell a
 * sample's arrays from an owner's own can read them here without importing
 * the template builder, which in turn runs the engines.
 */
export const REGISTRY: Record<IndustryId, IndustrySample> = {
  dental: dentalTemplate,
  retail: retailTemplate,
  professional_services: professionalServicesTemplate,
  restaurant: restaurantTemplate,
  construction: constructionTemplate,
  automotive: automotiveTemplate,
  nonprofit: nonprofitTemplate,
  general: generalTemplate,
};

/**
 * The sample for an industry as written, falling back to the default
 * industry's exactly as getIndustryTemplate does. Its `people`, `knowledge`
 * and `relations` are the same arrays the built template carries, so an
 * identity check against them tells a sample from an owner's own.
 */
export function industrySample(id: IndustryId): IndustrySample {
  return REGISTRY[id in REGISTRY ? id : DEFAULT_INDUSTRY];
}
