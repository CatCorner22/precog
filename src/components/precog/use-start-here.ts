import { useMemo } from "react";
import { usePracticeState } from "@/lib/precog/practice-context";
import { useToday } from "@/lib/precog/decisions/use-today";
import { buildStartHereModel, type StartHereModel } from "@/lib/precog/start-here/model";
import type { SodDetectionReport } from "@/lib/precog/sod/detect";

/**
 * Start here's figures for the business on screen, recomputed when the
 * profile, the template or the day changes. `sod` is the shell's own
 * duty-conflict report on the same profile, reused rather than run again.
 */
export function useStartHere(sod?: SodDetectionReport): StartHereModel {
  const { profile, template } = usePracticeState();
  const today = useToday();
  return useMemo(
    () => buildStartHereModel({ profile, template, today, sod }),
    [profile, template, today, sod],
  );
}
