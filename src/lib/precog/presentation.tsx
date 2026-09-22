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

/**
 * Terminology map.
 *
 * Left column is what the screen says in plain mode; right column is the
 * framework or tactical term. Both are kept visible in the glossary rather
 * than hidden, because an owner who will sit across from an accountant, a
 * lender, or an insurer benefits from knowing both words for the same thing.
 */
export interface GlossaryEntry {
  plain: string;
  formal: string;
  meaning: string;
  whyItMatters: string;
}

export const GLOSSARY: GlossaryEntry[] = [
  {
    plain: "One person controls too much",
    formal: "Segregation of duties conflict",
    meaning:
      "The same person can both carry out a transaction and record or check it, so nothing they do gets a second look.",
    whyItMatters:
      "This is the condition present in nearly every case in this application's library. It is not a paperwork problem; it is the thing that makes the loss possible.",
  },
  {
    plain: "What is still exposed after your current safeguards",
    formal: "Residual risk",
    meaning:
      "Start with how bad something could be, subtract what your existing safeguards actually take off, and what remains is what you are carrying.",
    whyItMatters:
      "Owners often have more protection than they realize in some areas and none at all in others. Naming what remains lets you accept it on purpose instead of by accident.",
  },
  {
    plain: "Two people must approve",
    formal: "Dual authorization / dual control",
    meaning:
      "A payment above a set amount needs a second person to release it, using their own login.",
    whyItMatters:
      "A shared login defeats this entirely. If the second approval can be given by the first person, the control exists only on paper.",
  },
  {
    plain: "Only one person knows how to do it",
    formal: "Single point of failure / key-person risk",
    meaning:
      "A task the business depends on that would stop if one particular person were unavailable.",
    whyItMatters:
      "This is a continuity problem and a fraud problem at once. Nobody can review work they do not understand, so sole knowledge quietly removes oversight too.",
  },
  {
    plain: "How your safeguards fit together",
    formal: "COSO Internal Control–Integrated Framework",
    meaning:
      "The standard reference that organizes internal controls into five areas. Auditors, lenders, and insurers use its vocabulary.",
    whyItMatters:
      "Useful as a checklist for coverage gaps. Not useful as a to-do list — a framework tells you the categories, not which specific thing to fix first.",
  },
  {
    plain: "How long a problem runs before anyone notices",
    formal: "Detection lag",
    meaning: "The time between when something starts and when it is found.",
    whyItMatters:
      "The published median is twelve months. Schemes caught within six months cost a median of $40,000; those running past five years cost a median above $1.1 million. Shortening this window is worth more than almost anything else you can do.",
  },
  {
    plain: "A way for staff to raise a concern",
    formal: "Reporting mechanism / whistleblower hotline",
    meaning:
      "Any route — a named outside accountant, a dedicated address, a simple form — by which an employee can report something without going through the person they are worried about.",
    whyItMatters:
      "Tips are the single largest route by which fraud comes to light, at 43% of detections — larger than any one control on its own, though controls and reviews together account for the rest. Only about a quarter of small organizations have one.",
  },
];
