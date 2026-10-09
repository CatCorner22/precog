import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  askButtonLabel,
  BUSINESS_CHANGED_MESSAGE,
  BriefMarkdown,
  CoachResultView,
  effortWords,
  moveDestination,
  MOVES_PREVIEW,
  briefClipboardText,
  briefAuthorLine,
  coachErrorMessage,
  extraWarnings,
  type CoachResult,
} from "./pioneer-coach-parts";

function result(over: Partial<CoachResult> = {}): CoachResult {
  return {
    ok: true,
    source: "local-agent",
    modelStatus: "not-asked",
    partial: false,
    question: "What should I do this week?",
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
    details: [],
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
      "Pioneer could not answer just now. Try again in a moment.",
    );
    expect(coachErrorMessage("boom")).toBe(
      "Pioneer could not answer just now. Try again in a moment.",
    );
  });
});

describe("business changes during a run", () => {
  it("asks for a new answer for the newly selected business", () => {
    expect(BUSINESS_CHANGED_MESSAGE).toBe(
      "You switched businesses while Pioneer was working. Ask again for this one.",
    );
  });
});

describe("ask button", () => {
  it("asks what to do this week when the box is empty, and says what the wait is", () => {
    expect(askButtonLabel(false, false)).toBe("What do I do this week?");
    expect(askButtonLabel(false, true)).toBe("Ask");
    expect(askButtonLabel(true, true)).toBe("Checking your records…");
    expect(effortWords("high")).toBe("Large job");
    expect(effortWords("custom")).toBe("custom");
  });
});

describe("briefAuthorLine", () => {
  it("says plainly whether a model wrote the brief", () => {
    expect(briefAuthorLine({ modelStatus: "not-asked" })).toBe(
      "Written by Precog's rules from your records. No AI wrote it.",
    );
    expect(briefAuthorLine({ modelStatus: "failed" })).toBe(
      "Written by Precog's rules from your records. No AI wrote it.",
    );
    expect(briefAuthorLine({ modelStatus: "answered", model: "grok-4.5" })).toBe(
      "Grok (grok-4.5) picked the moves most relevant to your question. Precog's rules wrote every word.",
    );
  });
});

describe("CoachResultView", () => {
  it("puts the brief first and the trace behind a closed disclosure", () => {
    const html = view(result());
    const brief = html.indexOf("What should I do this week?");
    const moves = html.indexOf("Recommended moves");
    const built = html.indexOf("How Pioneer built this brief");
    expect(brief).toBeGreaterThanOrEqual(0);
    expect(brief).toBeLessThan(moves);
    expect(moves).toBeLessThan(built);
    expect(html).toMatch(/<details class="[^"]*"><summary/);
    expect(html).not.toContain("<details open");
    expect(html).not.toContain("local-agent");
    expect(html).not.toContain("avg=64");
    expect(html).toContain("No AI wrote it");
    expect(html).toContain("Steps · 1 check");
    expect(html).not.toContain("120 ms");
  });

  it("shows the top moves with 'Show all', and a logged move as added", () => {
    const html = view(result(), ["Move 1"]);
    expect(html.match(/Add to the Decisions log</g)).toHaveLength(MOVES_PREVIEW - 1);
    expect(html).toContain("Added to the Decisions log");
    expect(html).toContain("Show all 5");
    expect(html).toContain("Small job");
    expect(html).not.toContain("low effort");
    expect(html).not.toContain("Move 5");
    expect(html.match(/<p class="mt-1 text-xs text-muted">Because\.<\/p>/g)).toHaveLength(
      MOVES_PREVIEW,
    );
  });

  it("hides copied move Markdown on screen and renders the structured details in the disclosure", () => {
    const html = view(
      result({
        markdown:
          "## Situation\nAll fine.\n\n## Recommended moves\n- Markdown-only move\n\n## Warnings\n- Nothing.",
        details: [
          { title: "What else moves", lines: ["**Cameras**: no change"] },
          { title: "Order of fixes (Precog's model)", lines: ["First, change access."] },
          { title: "Tradeoffs", lines: ["Fewer handoffs; more review."] },
        ],
      }),
    );
    expect(html).not.toContain("Markdown-only move");
    expect(html).toContain("What else moves");
    expect(html).toContain("Order of fixes (Precog");
    expect(html).toMatch(/<strong[^>]*>Cameras<\/strong>/);
    expect(html.indexOf("Critic: what could go wrong")).toBeLessThan(
      html.indexOf("What else moves"),
    );
    expect(html.indexOf("What else moves")).toBeLessThan(
      html.indexOf("Where the figures come from"),
    );
    expect(html).toContain(
      "Add one to the Decisions log. The next brief follows it up instead of repeating it.",
    );
  });

  it("opens the screen a move is about", () => {
    const html = view(
      result({
        decisions: [
          {
            action: "Give one duty to someone else",
            rationale: "Because.",
            effort: "medium",
            horizonDays: 14,
            link: { tab: "sod", personId: "p2" },
          },
        ],
      }),
    );
    expect(html).toContain("Open this person on Team");
    expect(html).not.toContain("Open Who controls what");
    expect(html).toContain("Medium job");
    expect(html).not.toContain("medium effort");
    expect(
      moveDestination({
        tab: "sod",
        personId: "p2",
        id: "person~p2~create_vendor~release_payment",
      }),
    ).toEqual({ tab: "team", item: "person~p2~create_vendor~release_payment" });
    expect(moveDestination({ tab: "sod", personId: "p2" })).toEqual({
      tab: "team",
      item: "person~p2",
    });
  });

  it("keeps a knowledge move on Who knows what", () => {
    const html = view(
      result({
        decisions: [
          {
            action: "Mark who can cover appeals",
            rationale: "Because.",
            effort: "low",
            horizonDays: 7,
            link: { tab: "knowledge", id: "k-appeals", personId: "p6" },
          },
        ],
      }),
    );
    expect(html).toContain("Open Who knows what");
    expect(html).not.toContain("Open this person on Team");
    expect(moveDestination({ tab: "knowledge", id: "k-appeals", personId: "p6" })).toEqual({
      tab: "knowledge",
      item: "k-appeals",
    });
  });

  it("offers the next questions under the moves", () => {
    const html = renderToStaticMarkup(
      <CoachResultView
        result={result()}
        onLog={() => {}}
        logged={new Set()}
        onCopy={() => {}}
        copied={false}
        nextQuestions={["If my front desk lead leaves, what breaks first?"]}
        onAsk={() => {}}
      />,
    );
    const moves = html.indexOf("Recommended moves");
    const next = html.indexOf("Ask next");
    const built = html.indexOf("How Pioneer built this brief");
    expect(moves).toBeLessThan(next);
    expect(next).toBeLessThan(built);
    expect(html).toContain("If my front desk lead leaves, what breaks first?");
  });

  it("labels a source by its tab's name, not its internal id", () => {
    const html = view(result());
    expect(html).toContain("Open Who knows what");
    expect(html).not.toMatch(/spof · ev-1/);
  });
});

describe("brief copy", () => {
  it("captures the question that produced the brief before the full Markdown", () => {
    expect(briefClipboardText({ question: "What changed?", markdown: "## Answer\nNothing." })).toBe(
      "**Question:** What changed?\n\n## Answer\nNothing.",
    );
  });
});

describe("extraWarnings", () => {
  it("keeps only the warnings the brief text does not already list", () => {
    const r = result({
      warnings: [
        "Nothing is at a red alert.",
        "Sign in to let Grok pick the most relevant moves. Precog's rules wrote this brief.",
      ],
    });
    expect(extraWarnings(r)).toEqual([
      "Sign in to let Grok pick the most relevant moves. Precog's rules wrote this brief.",
    ]);
  });

  it("hides the watched-condition warning when the replacement line is in the brief", () => {
    const warning =
      "5 watched conditions breached: the conditions that come before a loss are present.";
    const r = result({
      markdown:
        "## Warnings\n- Watched conditions: **5 breached**, 1 at watch (thresholds set in Precog, not benchmarks)",
      warnings: [warning],
    });
    expect(extraWarnings(r)).toEqual([]);
    expect(extraWarnings({ ...r, markdown: "## Warnings\n- Not checked in this run" })).toEqual([
      warning,
    ]);
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
