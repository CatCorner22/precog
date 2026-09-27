import { describe, expect, it } from "vitest";
import { workspacePrefix } from "../../src/lib/precog/workspace-storage.ts";
import { ACTIVE_PROFILE_KEY as APP_PROFILE_KEY } from "../../src/lib/precog/practice-profile.ts";
import { ACTIVE_PROFILE_KEY, profileStorageKey } from "./e2e.mjs";
import { eventually } from "./steps.mjs";

describe("browser smoke helpers", () => {
  it("name the storage keys the app writes", () => {
    expect(ACTIVE_PROFILE_KEY).toBe(APP_PROFILE_KEY);
    expect(profileStorageKey()).toBe(`${workspacePrefix(null)}${APP_PROFILE_KEY}`);
    expect(profileStorageKey("user 1")).toBe(`${workspacePrefix("user 1")}${APP_PROFILE_KEY}`);
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
