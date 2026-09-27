import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  BriefMarkdown,
  CoachResultView,
  MOVES_PREVIEW,
  briefAuthorLine,
  coachErrorMessage,
  extraWarnings,
  journalEntry,
  type CoachResult,
} from "./pioneer-coach-parts";

function result(over: Partial<CoachResult> = {}): CoachResult {
  return {
    ok: true,
    source: "local-agent",
    modelStatus: "not-asked",
    partial: false,
    markdown: "## Situation\nAll fine.\n\n## Warnings\n- Nothing is at a red alert.",
    contextFingerprint: "avg=64;lead=5/2;tools=16",
    latencyMs: 120,
    toolsUsed: ["get_practice_snapshot"],
    steps: [{ phase: "retrieve", title: "Gathered facts from 1 tools", detail: "snapshot" }],
    evidence: [
      { id: "ev-1", kind: "spof", label: "Insurance denial appeals", link: { tab: "knowledge" } },
    ],
    warnings: ["Nothing is at a red alert."],
    decisions: Array.from({ length: 5 }, (_, i) => ({
      action: `Move ${i + 1}`,
      rationale: "Because.",
      effort: "low",
      horizonDays: 7,
    })),
    specialistNotes: [{ agent: "critic", title: "Critic: what could go wrong", bullets: ["b"] }],
    ...over,
  };
}

function view(r: CoachResult, logged: string[] = []): string {
  return renderToStaticMarkup(
    <CoachResultView
      result={r}
      onLog={() => {}}
      logged={new Set(logged)}
      onCopy={() => {}}
      copied={false}
    />,
  );
}

describe("coachErrorMessage", () => {
  it("shows the server's own words for a 429, including the sign-in hint", () => {
    const e = Object.assign(new Error("Too many requests — sign in, or try again in a minute."), {
      status: 429,
    });
    expect(coachErrorMessage(e)).toBe("Too many requests — sign in, or try again in a minute.");
  });

  it("shows a plain sentence for an error the server did not explain", () => {
    expect(coachErrorMessage(new Error("TypeError: x is undefined"))).toBe(
      "The brief could not be built. Try again in a moment.",
    );
    expect(coachErrorMessage("boom")).toBe("The brief could not be built. Try again in a moment.");
  });
});

describe("journalEntry", () => {
  it("links a cross-training move to its register item so the next brief follows it up", () => {
    const entry = journalEntry(
      {
        action: "Cross-train Chris Patel on Insurance denial appeals",
        rationale: "Only Jordan can run it.",
        effort: "medium",
        horizonDays: 30,
        link: { tab: "knowledge", id: "k-appeals", step: "cover", personId: "p6" },
      },
      new Date(2026, 8, 1),
    );
    expect(entry).toMatchObject({
      kind: "remediate",
      linkedTab: "knowledge",
      linkedId: "k-appeals",
      linkedStep: "cover",
      linkedPersonId: "p6",
      reviewBy: "2026-10-01",
    });
  });
});

describe("briefAuthorLine", () => {
  it("says plainly whether a model wrote the brief", () => {
    expect(briefAuthorLine({ modelStatus: "not-asked" })).toMatch(/No AI model wrote it/);
    expect(briefAuthorLine({ modelStatus: "failed" })).toMatch(/No AI model wrote it/);
    expect(briefAuthorLine({ modelStatus: "answered", model: "grok-4.5" })).toMatch(
      /^Written by Grok \(grok-4\.5\)/,
    );
  });
});

describe("CoachResultView", () => {
  it("puts the brief first and the trace behind a closed disclosure", () => {
    const html = view(result());
    const brief = html.indexOf("Your brief");
    const moves = html.indexOf("Add a move to the Decisions log");
    const built = html.indexOf("How this brief was built");
    expect(brief).toBeGreaterThanOrEqual(0);
    expect(brief).toBeLessThan(moves);
    expect(moves).toBeLessThan(built);
    expect(html).toMatch(/<details class="[^"]*"><summary/);
    expect(html).not.toContain("<details open");
    expect(html).not.toContain("local-agent");
    expect(html).not.toContain("avg=64");
    expect(html).toContain("No AI model wrote it");
  });

  it("shows the top moves with 'Show all', and a logged move as added", () => {
    const html = view(result(), ["Move 1"]);
    expect(html.match(/Add to the Decisions log</g)).toHaveLength(MOVES_PREVIEW - 1);
    expect(html).toContain("Added to the Decisions log");
    expect(html).toContain("Show all 5");
    expect(html).not.toContain("Move 5");
  });

  it("labels a source by its tab's name, not its internal id", () => {
    const html = view(result());
    expect(html).toContain("Open Who knows what");
    expect(html).not.toMatch(/spof · ev-1/);
  });
});

describe("extraWarnings", () => {
  it("keeps only the warnings the brief text does not already list", () => {
    const r = result({
      warnings: ["Nothing is at a red alert.", "Sign in to have Grok write it."],
    });
    expect(extraWarnings(r)).toEqual(["Sign in to have Grok write it."]);
  });
});

describe("BriefMarkdown", () => {
  it("renders sections as h3 and h4 under the card title, and '---' as a rule", () => {
    const html = renderToStaticMarkup(
      <BriefMarkdown
        markdown={"## Moves\n### Lens\n- one\n\n---\n\n**Check before quoting:** x"}
      />,
    );
    expect(html).toContain("<h3");
    expect(html).toContain("<h4");
    expect(html).toContain("<hr");
    expect(html).not.toContain(">---<");
    expect(html).toContain("<strong");
  });
});
