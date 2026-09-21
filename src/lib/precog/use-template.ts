import { usePractice } from "./practice-context";
import type { IndustryTemplate } from "./templates/types";

/** The active profile's industry template with its custom people/processes applied. */
export function useTemplate(): IndustryTemplate {
  return usePractice().template;
}
