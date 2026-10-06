import { describe, expect, it } from "vitest";
import { IGNORED_CONSOLE, consoleLine } from "./e2e.mjs";

describe("browser smoke console lines", () => {
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
});
