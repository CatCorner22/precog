import { describe, expect, it } from "vitest";
import { workspacePrefix } from "../../src/lib/precog/workspace-storage.ts";
import { ACTIVE_PROFILE_KEY as APP_PROFILE_KEY } from "../../src/lib/precog/practice-profile.ts";
import { ACTIVE_PROFILE_KEY, IGNORED_CONSOLE, consoleLine, profileStorageKey } from "./e2e.mjs";
import { eventually } from "./steps.mjs";

describe("browser smoke helpers", () => {
  it("name the storage keys the app writes", () => {
    expect(ACTIVE_PROFILE_KEY).toBe(APP_PROFILE_KEY);
    expect(profileStorageKey()).toBe(`${workspacePrefix(null)}${APP_PROFILE_KEY}`);
    expect(profileStorageKey("user 1")).toBe(`${workspacePrefix("user 1")}${APP_PROFILE_KEY}`);
  });

  it("names the address a failed load comes from, and drops the browser's favicon request", () => {
    const failed = "Failed to load resource: the server responded with a status of 404 ()";
    const favicon = consoleLine(failed, "http://127.0.0.1:8080/favicon.ico");
    expect(favicon).toBe(`${failed} (http://127.0.0.1:8080/favicon.ico)`);
    expect(IGNORED_CONSOLE.test(favicon)).toBe(true);
    // Before this, the line carried no address, so the favicon filter missed it.
    expect(IGNORED_CONSOLE.test(failed)).toBe(false);
    const missing = consoleLine(failed, "http://127.0.0.1:8080/api/errors");
    expect(missing).toContain("/api/errors");
    expect(IGNORED_CONSOLE.test(missing)).toBe(false);
    expect(consoleLine("plain message", "")).toBe("plain message");
    expect(consoleLine("x at http://a/b.js", "http://a/b.js")).toBe("x at http://a/b.js");
  });

  it("eventually returns the first truthy value and times out with the message", async () => {
    let calls = 0;
    expect(await eventually(async () => ++calls >= 3 && calls, "never")).toBe(3);
    await expect(
      eventually(
        async () => false,
        () => "gave up",
        150,
      ),
    ).rejects.toThrow("gave up");
  });
});
