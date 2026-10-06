import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { memoryStorage } from "@/test/memory-storage";
import { AppErrorComponent, CrashScreen, recoveryWorkspace } from "./error-component";
import { CLEAR_LOCAL_CONFIRM } from "./precog/recovery-copy";
import { ScopedStorage, workspacePrefix } from "./precog/workspace-storage";

const render = () =>
  renderToStaticMarkup(
    <AppErrorComponent error={new Error("Boom")} reset={() => undefined} info={undefined} />,
  );

/** Each recovery button's markup, keyed by its label. */
function buttons(html: string): Record<string, string> {
  return Object.fromEntries(
    [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map(([tag, label]) => [label, tag]),
  );
}

const RECOVERY_BUTTONS = [
  "Download a recovery copy",
  "Restore from a recovery file",
  "Clear the saved data on this device and reload",
];

/** The disabled attribute, not the `disabled:` style variants in the class list. */
const DISABLED = /\sdisabled=""/;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the crash screen", () => {
  it("offers the recovery download, then the restore, before clearing this browser's data", () => {
    const html = render();
    const download = html.indexOf("Download a recovery copy");
    const restore = html.indexOf("Restore from a recovery file");
    const clear = html.indexOf("Clear the saved data on this device and reload");
    expect(download).toBeGreaterThan(-1);
    expect(restore).toBeGreaterThan(download);
    expect(clear).toBeGreaterThan(restore);
    expect(html).toContain('type="file"');
    expect(html).toContain("Boom");
  });

  it("warns, before clearing, that clearing is final", () => {
    expect(CLEAR_LOCAL_CONFIRM.endsWith("You cannot undo this.")).toBe(true);
    expect(CLEAR_LOCAL_CONFIRM).toContain("recovery copy");
  });

  it("keeps the recovery buttons enabled when the crash comes from the workspace provider itself", () => {
    const local = memoryStorage();
    const session = memoryStorage();
    vi.stubGlobal("window", { localStorage: local, sessionStorage: session });
    // Outside the workspace provider the context holds no storage.
    const workspace = recoveryWorkspace({ accountId: null, local: null, session: null }, "A");
    expect(workspace.accountId).toBe("A");
    expect(workspace.local?.prefix).toBe(workspacePrefix("A"));
    expect(workspace.session?.prefix).toBe(workspacePrefix("A"));

    const html = renderToStaticMarkup(
      <CrashScreen error={new Error("Boom")} workspace={workspace} />,
    );
    const rendered = buttons(html);
    for (const label of RECOVERY_BUTTONS) {
      expect(rendered[label]).toBeDefined();
      expect(rendered[label]).not.toMatch(DISABLED);
    }
  });

  it("acts on the workspace it is inside when there is one", () => {
    const context = {
      accountId: "A",
      local: new ScopedStorage(memoryStorage(), "A"),
      session: new ScopedStorage(memoryStorage(), "A"),
    };
    expect(recoveryWorkspace(context, "B")).toBe(context);
  });

  it("disables the recovery buttons when this browser keeps no data Precog can reach", () => {
    // The server, and a browser that blocks site data, have no storage to act on.
    const workspace = recoveryWorkspace({ accountId: null, local: null, session: null }, null);
    expect(workspace.local).toBeNull();
    const rendered = buttons(
      renderToStaticMarkup(<CrashScreen error={new Error("Boom")} workspace={workspace} />),
    );
    for (const label of RECOVERY_BUTTONS) expect(rendered[label]).toMatch(DISABLED);
  });
});
