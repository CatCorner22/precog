import { isValidElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { resolveTemplate } from "@/lib/precog/active-template";
import { defaultProfile } from "@/lib/precog/practice-profile";
import { buildStartHereModel } from "@/lib/precog/start-here/model";
import { StartHereContinuitySection } from "./start-here-continuity-section";

vi.mock("@/lib/precog/presentation", () => ({
  useTabName: () => (tab: string) => tab,
}));

function button(node: ReactNode, name: string): (() => void) | undefined {
  if (!isValidElement(node)) return;
  const props = node.props as { children?: ReactNode; onClick?: () => void };
  if (node.type === "button" && [props.children].flat().includes(name)) return props.onClick;
  if (typeof node.type === "function") {
    return button((node.type as (props: unknown) => ReactNode)(node.props), name);
  }
  for (const child of [props.children].flat()) {
    const found = button(child, name);
    if (found) return found;
  }
}

describe("Start here Today destinations", () => {
  it.each([
    ["out", "Open today's stand-in sheet", "absences"],
    ["gone", "Mark them as left", "leaving"],
    ["soon", "Log the hand-offs", "absences"],
    ["leaving", "Open the hand-off", "leaving"],
    ["debrief", "Debrief the stand-ins", "absences"],
    ["out-and-gone", "Open today's stand-in sheet", "absences"],
  ])("%s: %s opens %s", (state, words, section) => {
    const profile = defaultProfile("dental");
    const sample = resolveTemplate(profile);
    if (state === "gone" || state === "leaving" || state === "out-and-gone") {
      profile.customPeople = sample.people.map((person) =>
        person.id === "p2"
          ? { ...person, lastDay: state === "leaving" ? "2026-09-28" : "2026-09-25" }
          : person,
      );
    }
    if (["out", "soon", "debrief", "out-and-gone"].includes(state)) {
      const day =
        state === "soon" ? "2026-09-28" : state === "debrief" ? "2026-09-25" : "2026-09-26";
      profile.plannedAbsences = [
        {
          id: "audit-absence",
          personId: "p3",
          industry: "dental",
          from: day,
          to: day,
        },
      ];
    }
    const model = buildStartHereModel({
      profile,
      template: resolveTemplate(profile),
      today: new Date(2026, 8, 26),
    }).continuity;
    const navigate = vi.fn();
    const tree = StartHereContinuitySection({ model, onOpenDetail: navigate, part: "today" });
    const click = button(tree, words);
    expect(click).toBeDefined();
    click?.();
    expect(navigate).toHaveBeenCalledWith("knowledge", section);
  });
});
