import type { IndustryId } from "../industry";
import type { IndustryTemplate } from "./types";
import { dentalTemplate } from "./dental";
import { retailTemplate } from "./retail";
import { professionalServicesTemplate } from "./professional-services";
import { restaurantTemplate } from "./restaurant";
import { generalTemplate } from "./general";

const REGISTRY: Record<IndustryId, IndustryTemplate> = {
  dental: dentalTemplate,
  retail: retailTemplate,
  professional_services: professionalServicesTemplate,
  restaurant: restaurantTemplate,
  general: generalTemplate,
};

export function getIndustryTemplate(id: IndustryId): IndustryTemplate {
  return REGISTRY[id] ?? dentalTemplate;
}

export {
  dentalTemplate,
  retailTemplate,
  professionalServicesTemplate,
  restaurantTemplate,
  generalTemplate,
};
export type { IndustryTemplate } from "./types";
export { LAYER_META } from "./layer-meta";
