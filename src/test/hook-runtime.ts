/**
 * A small stand-in for React's `useState` and `useEffect`, for running a
 * component as a plain function in the node test environment, where there
 * is no DOM renderer. State persists from one render to the next; after a
 * render, an effect runs (its previous cleanup first) when it has no
 * dependency list or when a dependency changed under `Object.is`, as React
 * compares them; a state change marks the component for another render.
 *
 * `settle` renders until nothing changes or `maxRenders` is reached, so a
 * test sees an effect that keeps firing because a dependency is a fresh
 * object on every render. A test routes its `react` mock here while
 * `runtime.active` is true (only during a render this runtime drives).
 */
export function createHookRuntime() {
  let states: unknown[] = [];
  let deps: (readonly unknown[] | undefined)[] = [];
  let cleanups: (void | (() => void))[] = [];
  let pending: (() => void)[] = [];
  let stateIndex = 0;
  let effectIndex = 0;
  let dirty = false;
  let active = false;

  function changed(prev: readonly unknown[] | undefined, next: readonly unknown[] | undefined) {
    if (!prev || !next || prev.length !== next.length) return true;
    return next.some((value, i) => !Object.is(value, prev[i]));
  }

  const runtime = {
    /** True while a render this runtime drives is running. */
    get active() {
      return active;
    },
    /** How many renders ran since the last `reset`. */
    renders: 0,
    useState<T>(init: T | (() => T)): [T, (next: T | ((current: T) => T)) => void] {
      const i = stateIndex++;
      if (!(i in states)) states[i] = typeof init === "function" ? (init as () => T)() : init;
      const set = (next: T | ((current: T) => T)) => {
        const value =
          typeof next === "function" ? (next as (current: T) => T)(states[i] as T) : next;
        if (Object.is(value, states[i])) return;
        states[i] = value;
        dirty = true;
      };
      return [states[i] as T, set];
    },
    useEffect(effect: () => void | (() => void), list?: readonly unknown[]): void {
      const i = effectIndex++;
      if (!changed(deps[i], list)) return;
      deps[i] = list;
      pending.push(() => {
        const cleanup = cleanups[i];
        if (typeof cleanup === "function") cleanup();
        cleanups[i] = effect();
      });
    },
    /** One render, then the effects whose dependencies changed. */
    render<T>(component: () => T): T {
      stateIndex = 0;
      effectIndex = 0;
      pending = [];
      dirty = false;
      active = true;
      let tree: T;
      try {
        tree = component();
      } finally {
        active = false;
      }
      runtime.renders += 1;
      for (const run of pending.splice(0)) run();
      return tree;
    },
    /**
     * Renders, lets pending promises settle, and renders again while state
     * changed, up to `maxRenders`. Returns the last render's tree.
     */
    async settle<T>(component: () => T, maxRenders = 40): Promise<T> {
      let tree = runtime.render(component);
      for (let n = 1; n < maxRenders; n++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (!dirty) break;
        tree = runtime.render(component);
      }
      return tree;
    },
    /** Runs every effect's cleanup, as an unmount does. */
    unmount(): void {
      for (const cleanup of cleanups) if (typeof cleanup === "function") cleanup();
      cleanups = [];
    },
    /** Unmounts and forgets all state, for the next test. */
    reset(): void {
      runtime.unmount();
      states = [];
      deps = [];
      pending = [];
      dirty = false;
      runtime.renders = 0;
    },
  };
  return runtime;
}

export type HookRuntime = ReturnType<typeof createHookRuntime>;
