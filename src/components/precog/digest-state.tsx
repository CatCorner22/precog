/* eslint-disable react-refresh/only-export-components -- the helpers next to the provider are tested on their own */
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * A digest setting changed on this page: the one-time question above the
 * tab strip and the switch in the header each load the stored settings on
 * their own, so a change made in one is told to the other through this
 * context rather than waiting for a reload. Both an answer and a flip of the
 * switch mark the question as answered (the server stamps digest_asked_at on
 * either save).
 */
export interface DigestChange {
  asked: boolean;
  weeklyDigest: boolean;
}

interface DigestState {
  change: DigestChange | null;
  record: (change: DigestChange) => void;
}

const DigestStateContext = createContext<DigestState>({ change: null, record: () => undefined });

/** Holds the page's digest changes; sign-out reloads the page, which empties it. */
export function DigestStateProvider({ children }: { children: ReactNode }) {
  const [change, setChange] = useState<DigestChange | null>(null);
  const value = useMemo(() => ({ change, record: setChange }), [change]);
  return <DigestStateContext.Provider value={value}>{children}</DigestStateContext.Provider>;
}

export function useDigestState(): DigestState {
  return useContext(DigestStateContext);
}

/** Whether the question is answered: a change made on this page wins over what loaded. */
export function askedAfter(change: DigestChange | null, loaded: boolean): boolean {
  return change?.asked ?? loaded;
}

/** Whether the digest is on: a change made on this page wins over what loaded. */
export function weeklyDigestAfter(change: DigestChange | null, loaded: boolean): boolean {
  return change?.weeklyDigest ?? loaded;
}
