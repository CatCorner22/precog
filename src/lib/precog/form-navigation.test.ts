import { afterEach, describe, expect, it, vi } from "vitest";
import { BEFORE_FORM_LEAVE, canLeaveForm } from "./form-navigation";

afterEach(() => vi.unstubAllGlobals());
describe("form navigation", () => {
  it("allows navigation with no browser or no pending form", () => {
    expect(canLeaveForm()).toBe(true);
    vi.stubGlobal("window", new EventTarget());
    expect(canLeaveForm()).toBe(true);
  });
  it("allows a form to keep the current workspace open", () => {
    const window = new EventTarget();
    vi.stubGlobal("window", window);
    window.addEventListener(BEFORE_FORM_LEAVE, (event) => event.preventDefault());
    expect(canLeaveForm()).toBe(false);
  });
});
