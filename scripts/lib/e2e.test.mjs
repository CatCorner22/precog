import { describe, expect, it, vi } from "vitest";
import { workspacePrefix } from "../../src/lib/precog/workspace-storage.ts";
import { ACTIVE_PROFILE_KEY as APP_PROFILE_KEY } from "../../src/lib/precog/practice-profile.ts";
import { ACTIVE_PROFILE_KEY, exploreSample, profileStorageKey } from "./e2e.mjs";
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

  it("uses the shared sample entry and waits for the business shell", async () => {
    const actions = [];
    const radio = {
      first: () => radio,
      click: vi.fn(async () => actions.push("industry")),
    };
    const button = { waitFor: vi.fn(async () => actions.push("name")) };
    const page = {
      getByRole: vi.fn((role) => (role === "radio" ? radio : button)),
      getByTestId: vi.fn(() => ({ click: async () => actions.push("sample") })),
      locator: vi.fn(() => ({ waitFor: async () => actions.push("shell") })),
    };
    await exploreSample(page, "Dental");
    expect(page.getByRole).toHaveBeenCalledWith("radio", { name: /^Dental/ });
    expect(page.getByRole).toHaveBeenCalledWith("button", {
      name: "Explore the fictional sample",
      exact: true,
    });
    expect(page.getByTestId).toHaveBeenCalledWith("explore-sample-business");
    expect(page.locator).toHaveBeenCalledWith("nav[data-tab-count]");
    expect(actions).toEqual(["industry", "name", "sample", "shell"]);
  });

  it("does not swallow a missing accessible sample entry", async () => {
    const missing = new Error("sample button not available");
    const radio = { first: () => radio, click: vi.fn() };
    const page = {
      getByRole: (role) =>
        role === "radio" ? radio : { waitFor: vi.fn().mockRejectedValue(missing) },
      getByTestId: vi.fn(),
    };
    await expect(exploreSample(page, "Retail")).rejects.toThrow(missing);
    expect(page.getByTestId).not.toHaveBeenCalled();
  });
});
