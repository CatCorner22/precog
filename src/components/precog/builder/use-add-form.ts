import { useState } from "react";

/**
 * The "Add" form under a list of risks, ideas, waste or evidence: open or
 * closed, the draft being typed, and a submit that hands the draft over,
 * clears it and closes the form. Fields named in `keep` (a risk's kind, an
 * idea's effort) keep their value for the next entry.
 */
export function useAddForm<D extends { title: string }>(empty: D, keep: readonly (keyof D)[]) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(empty);
  const set = <K extends keyof D>(key: K, value: D[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const ready = draft.title.trim().length > 0;

  function submit(add: (draft: D) => void) {
    if (!ready) return;
    add(draft);
    setDraft((current) => {
      const next = { ...empty };
      for (const key of keep) next[key] = current[key];
      return next;
    });
    setAdding(false);
  }

  return { adding, toggle: () => setAdding((open) => !open), draft, set, ready, submit };
}
