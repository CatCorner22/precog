import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllGlobals());

async function reporter() {
  vi.resetModules();
  const beacon = vi.fn((_url: string, _body: Blob) => true);
  vi.stubGlobal("window", { location: { pathname: "/report" } });
  vi.stubGlobal("navigator", { sendBeacon: beacon });
  const mod = await import("./report-browser");
  return { ...mod, beacon };
}

describe("browser error reporting", () => {
  it("does not report a stale-bundle chunk failure or the ResizeObserver notice", async () => {
    const { reportClientError, beacon } = await reporter();
    reportClientError(new TypeError("Failed to fetch dynamically imported module: /assets/a.js"));
    reportClientError("ResizeObserver loop completed with undelivered notifications.");
    expect(beacon).not.toHaveBeenCalled();
    reportClientError(new Error("real crash"));
    expect(beacon).toHaveBeenCalledOnce();
  });

  it("recognises chunk-load failures by name or message", async () => {
    const { isChunkLoadError } = await reporter();
    const named = new Error("x");
    named.name = "ChunkLoadError";
    expect(isChunkLoadError(named)).toBe(true);
    expect(isChunkLoadError("Importing a module script failed.")).toBe(true);
    expect(isChunkLoadError(new Error("boom"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });

  it("reports one crash once and at most ten per page", async () => {
    const { reportClientError, beacon } = await reporter();
    reportClientError(new Error("same"));
    reportClientError(new Error("same"));
    expect(beacon).toHaveBeenCalledOnce();
    for (let i = 0; i < 20; i += 1) reportClientError(new Error(`crash ${i}`));
    expect(beacon).toHaveBeenCalledTimes(10);
  });
});
