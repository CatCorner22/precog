import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { defaultProfile } from "./practice-profile";
import {
  PracticeContextPublisher,
  usePractice,
  usePracticeSync,
  type PracticeActions,
  type PracticeState,
  type PracticeSync,
} from "./practice-context";
import { resolveTemplate } from "./active-template";

const profile = defaultProfile("general");
const state = {
  profile,
  ready: true,
  template: resolveTemplate(profile),
  mapCustomized: false,
  setupReturnsTo: null,
  businesses: [],
  switchingBusiness: false,
  canUndoMap: false,
  canRedoMap: false,
} satisfies PracticeState;
const actions = {} as PracticeActions;

// React re-renders a component when a context it read changes. Publishing no
// save state at all shows which readers depend on it: a reader of
// usePractice() renders without it, so a save landing never re-renders the
// shell and the tabs; usePracticeSync() needs it.
const render = (children: ReactNode) =>
  renderToStaticMarkup(
    <PracticeContextPublisher
      state={state}
      actions={actions}
      sync={null as unknown as PracticeSync}
    >
      {children}
    </PracticeContextPublisher>,
  );

describe("the practice context parts", () => {
  it("leaves save state out of usePractice(), so a save landing does not re-render its readers", () => {
    let keys: string[] = [];
    function Reader() {
      keys = Object.keys(usePractice());
      return null;
    }
    expect(() => render(<Reader />)).not.toThrow();
    expect(keys).toContain("profile");
    expect(keys).not.toContain("syncStatus");
    expect(keys).not.toContain("saveConflict");
  });

  it("gives save state only to the panels that ask for it", () => {
    function SaveBadge() {
      return <span>{usePracticeSync().syncStatus}</span>;
    }
    expect(() => render(<SaveBadge />)).toThrow("usePracticeSync requires PracticeProvider");
  });
});
