import { useMemo } from "react";
import { getActiveTemplate } from "./active-template";
import { usePractice } from "./practice-context";
import type { IndustryTemplate } from "./templates/types";

/** React hook — re-renders when industry template or profile industry changes. */
export function useTemplate(): IndustryTemplate {
  const { profile, templateRevision } = usePractice();
  return useMemo(
    () => getActiveTemplate(),
    [profile.industry, templateRevision],
  );
}
