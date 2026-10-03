import {
  REGISTER_RESPONSIVE_ITEMS,
  REGISTER_RESPONSIVE_PEOPLE,
  registerOverResponsiveLimit,
} from "./register-window";

/** Shared copy when the team or register exceeds responsive thresholds. */
export function registerScaleWarning(people: number, items: number): string | null {
  if (!registerOverResponsiveLimit(people, items)) return null;
  return `This business has ${people} people and ${items} register items. Past ${REGISTER_RESPONSIVE_PEOPLE} people or ${REGISTER_RESPONSIVE_ITEMS} items, some views paginate the grid and heavy edits may feel slower — plan cross-training and written procedures first.`;
}

export function teamSizeScaleWarning(activePeople: number): string | null {
  if (activePeople <= REGISTER_RESPONSIVE_PEOPLE) return null;
  return `You entered ${activePeople} people. The continuity register stays responsive up to about ${REGISTER_RESPONSIVE_PEOPLE} active people; larger teams can lean on import, paging, and the printed report's ranked next steps rather than one giant grid.`;
}
