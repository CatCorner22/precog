import { useMemo } from "react";
import { usePracticeState } from "../practice-context";
import { scoreMap, type ScoredMap } from "./scored-map";

/** The active map's health, scored as the map page scores it (see scoreMap). */
export function useScoredMap(): ScoredMap {
  const { profile, template: tpl, mapCustomized } = usePracticeState();
  const { industry, customPeople, staff, mapLayout } = profile;
  return useMemo(
    () =>
      scoreMap(tpl, tpl.processes, staff, {
        profile: { industry, customPeople },
        layout: mapLayout ?? {},
        customized: mapCustomized,
      }),
    [tpl, staff, industry, customPeople, mapLayout, mapCustomized],
  );
}
