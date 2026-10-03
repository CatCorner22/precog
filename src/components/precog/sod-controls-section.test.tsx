import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  confirmedControlIds,
  controlsInPlace,
  resolveTemplate,
} from "@/lib/precog/active-template";
import { resolveNavTarget } from "@/lib/precog/navigation";
import { defaultProfile } from "@/lib/precog/practice-profile";
import { ReadOnlyPracticeProvider } from "@/lib/precog/read-only-practice";
import type { ControlItem } from "@/lib/precog/types";
import { confirmControlEntry, inPlaceEntry } from "@/lib/precog/control-entries";
import { SodControlsSection } from "./sod-controls-section";

const control: ControlItem = {
  id: "ctl-cash",
  name: "Cash handling split",
  description: "Two people count the drawer.",
  duties: [],
  segregated: false,
  compensatingControls: [],
  residualRiskAccepted: false,
};
const now = new Date(2026, 9, 2);

describe("the Controls view's Decisions log entries", () => {
  it('records a control in place under linkedTab "control-in-place", as before', () => {
    const entry = inPlaceEntry(control, "The CFO reviews each bank reconciliation", now);
    expect(entry).toEqual({
      subject: "In place: Cash handling split",
      kind: "monitor",
      note: "The CFO reviews each bank reconciliation",
      reviewBy: "2026-12-31",
      linkedTab: "control-in-place",
      linkedId: "ctl-cash",
    });
    // The engines still read it, and its "Open" button lands on Controls.
    expect(controlsInPlace([entry], "general")).toEqual({
      "ctl-cash": ["The CFO reviews each bank reconciliation"],
    });
    expect(resolveNavTarget(entry.linkedTab!, entry.linkedId)).toEqual({
      tab: "sod",
      item: "controls",
    });
  });

  it('confirms a sample control under linkedTab "control", as before', () => {
    const entry = confirmControlEntry({ ...control, starter: true }, now);
    expect(entry.linkedTab).toBe("control");
    expect(entry.linkedId).toBe("ctl-cash");
    expect(entry.reviewBy).toBe("2026-12-31");
    expect(confirmedControlIds([entry], "general")).toEqual(["ctl-cash"]);
    expect(resolveNavTarget(entry.linkedTab!)).toEqual({ tab: "sod", item: "controls" });
  });
});

describe("the Controls view", () => {
  it("lists every control in the template under its heading", () => {
    const profile = defaultProfile("general");
    const html = renderToStaticMarkup(
      <ReadOnlyPracticeProvider profile={profile}>
        <SodControlsSection />
      </ReadOnlyPracticeProvider>,
    );
    expect(html).toContain("<h2");
    expect(html).toContain("Controls");
    for (const c of resolveTemplate(profile).controls) {
      expect(html).toContain(c.name.replace(/&/g, "&amp;").replace(/'/g, "&#x27;"));
    }
  });
});
