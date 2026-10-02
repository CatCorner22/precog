import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { defaultProfile } from "@/lib/precog/practice-profile";
import { ReadOnlyPracticeProvider } from "@/lib/precog/read-only-practice";
import { resolveTemplate } from "@/lib/precog/active-template";
import * as detect from "@/lib/precog/sod/detect";
import { SodPanel } from "./sod-panel";

vi.mock("@/lib/precog/sod/detect", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/precog/sod/detect")>();
  return { ...actual, detectSodConflicts: vi.fn(actual.detectSodConflicts) };
});

const render = (withShellReport: boolean) => {
  const profile = defaultProfile("general");
  const tpl = resolveTemplate(profile);
  const report = detect.detectSodConflicts(
    tpl,
    profile.staff,
    detect.sodDetectionOptions(tpl, profile.dualRelease),
  );
  vi.mocked(detect.detectSodConflicts).mockClear();
  const html = renderToStaticMarkup(
    <ReadOnlyPracticeProvider profile={profile}>
      <SodPanel report={withShellReport ? report : undefined} />
    </ReadOnlyPracticeProvider>,
  );
  return { html, runs: vi.mocked(detect.detectSodConflicts).mock.calls.length };
};

describe("the duty-conflict tab", () => {
  it("shows the shell's report instead of running the check again", () => {
    const own = render(false);
    const shell = render(true);
    expect(own.runs).toBeGreaterThan(0);
    expect(shell.runs).toBe(own.runs - 1);
    expect(shell.html).toBe(own.html);
  });
});
