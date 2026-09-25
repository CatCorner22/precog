/* eslint-disable react-refresh/only-export-components */

import { createContext, useContext, useEffect, useMemo, useState } from "react";

/**
 * Presentation mode.
 *
 * "plain" is the default and the product's real voice: a small business owner
 * reading a finding should not have to decode a framework vocabulary to learn
 * that one person can both write and reconcile the company's checks.
 *
 * "tactical" preserves the existing threat-operations styling and naming for
 * users who prefer it. It is a skin over identical findings and identical
 * numbers — mode never changes what the engines compute, only what the screen
 * calls it.
 */
export type PresentationMode = "plain" | "tactical";

const STORAGE_KEY = "precog.presentation-mode";

interface PresentationValue {
  mode: PresentationMode;
  setMode: (mode: PresentationMode) => void;
  /** Pick the wording for the active mode. */
  say: (plain: string, tactical: string) => string;
  isPlain: boolean;
}

const PresentationContext = createContext<PresentationValue | null>(null);

export function PresentationProvider({ children }: { children: React.ReactNode }) {
  // Always start "plain" so the server-rendered markup and the first client
  // render agree; a stored preference is applied after mount.
  const [mode, setModeState] = useState<PresentationMode>("plain");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "tactical" || stored === "plain") setModeState(stored);
    } catch {
      // Storage can be unavailable in private browsing. Plain mode is a safe
      // default, so there is nothing to recover from.
    }
  }, []);

  const value = useMemo<PresentationValue>(() => {
    const setMode = (next: PresentationMode) => {
      setModeState(next);
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Preference simply does not persist. The session still works.
      }
    };
    return {
      mode,
      setMode,
      isPlain: mode === "plain",
      say: (plain, tactical) => (mode === "plain" ? plain : tactical),
    };
  }, [mode]);

  return <PresentationContext.Provider value={value}>{children}</PresentationContext.Provider>;
}

export function usePresentation(): PresentationValue {
  const ctx = useContext(PresentationContext);
  if (!ctx) {
    // Rendering outside the provider should not crash a page. Plain wording is
    // the correct fallback.
    return {
      mode: "plain",
      setMode: () => {},
      isPlain: true,
      say: (plain) => plain,
    };
  }
  return ctx;
}
