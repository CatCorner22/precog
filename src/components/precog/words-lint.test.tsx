import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { prerender } from "react-dom/static";
import { describe, expect, it, vi } from "vitest";
import { resolveTemplate } from "@/lib/precog/active-template";
import { TAB_ALIASES, TAB_IDS } from "@/lib/precog/navigation";
import { defaultProfile } from "@/lib/precog/practice-profile";
import { ReadOnlyPracticeProvider } from "@/lib/precog/read-only-practice";
import { buildStartHereModel } from "@/lib/precog/start-here/model";
import { GlossaryDialog } from "./glossary-dialog";
import { PageIntro } from "./page-intro";
import { PresentationToggle } from "./presentation-toggle";
import { StartHere } from "./start-here";
import { EvidenceFooter } from "./start-here-parts";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  useNavigate: () => () => {},
}));

const ROOT = join(__dirname, "../../..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.|\.gen\./.test(entry.name) ? [path] : [];
  });
}

/** Source text with comments removed, so a note about a word is not a use of it. */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

const files = sourceFiles(join(ROOT, "src")).map((path) => ({
  path: relative(ROOT, path).split("\\").join("/"),
  text: code(path),
}));

/** Syllables in one word: vowel groups, less a silent final e, at least one. */
function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 1;
  const groups = w.match(/[aeiouy]+/g)?.length ?? 1;
  const silentE = /[^aeiouy]e$/.test(w) && !/[^aeiouy]le$/.test(w) && groups > 1 ? 1 : 0;
  return Math.max(1, groups - silentE);
}

/** Flesch-Kincaid grade of a passage. */
function fkGrade(text: string): number {
  const sentences = text.split(/[.!?]+(?:\s|$)/).filter((s) => /\w/.test(s)).length || 1;
  const words = text.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w));
  const syl = words.reduce((sum, w) => sum + syllables(w), 0);
  return 0.39 * (words.length / sentences) + 11.8 * (syl / words.length) - 15.59;
}

function textOf(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

describe('"Fix first" keeps one meaning', () => {
  /** The only files that may say "Fix first", each with its reason. */
  const ALLOWED: Record<string, string> = {
    // PRIORITY_BAND_LABEL and the severity key: the priority list's top band.
    "src/lib/precog/scoring/bands.ts": "the priority list",
    // Report layouts 1 to 5 print the words they printed when a version was locked.
    "src/components/precog/control-report.tsx": "locked report layouts",
    // The glossary entry for the priority list's top band.
    "src/lib/precog/glossary.ts": "the priority list, defined",
  };

  it("appears on no screen outside the priority list", () => {
    expect(files.length).toBeGreaterThan(100);
    const found = files.filter((f) => /Fix first/.test(f.text)).map((f) => f.path);
    expect(found.sort()).toEqual(Object.keys(ALLOWED).sort());
  });

  it("is not a residual band: the bands read Low, Moderate, High and Severe", () => {
    const basis = files.find((f) => f.path === "src/components/precog/scoring-basis.tsx")!.text;
    expect(basis).toMatch(/RESIDUAL_BAND_LABEL\.accept_monitor/);
    expect(basis).not.toMatch(/Worth doing|Fix soon/);
  });
});

describe('"Words used here" opens the glossary from every page', () => {
  it("is on every PageIntro, for every tab and alias", () => {
    for (const tab of [...TAB_IDS, ...(Object.keys(TAB_ALIASES) as (keyof typeof TAB_ALIASES)[])]) {
      const html = renderToStaticMarkup(<PageIntro tab={tab} purpose="What this page is for." />);
      expect(html, tab).toMatch(
        /<button[^>]*aria-haspopup="dialog"[^>]*>.*Words used here<\/button>/,
      );
    }
  });

  /**
   * Pages with their own h1 that are not a home tab, each with its reason.
   * Every other file that draws a page heading carries the link.
   */
  const NOT_A_TAB: Record<string, string> = {
    "src/components/precog/control-report.tsx": "the printed report",
    "src/components/precog/procedures/procedure-print.tsx": "a printed procedure",
    "src/components/precog/share-gate.tsx": "the public share page",
    "src/components/precog/operator/operator-console.tsx": "the operator page",
    "src/components/precog/firm/engagement-archive.tsx": "the firm page",
  };

  it("is on every home-tab heading Precog draws", () => {
    const headings = files.filter(
      (f) =>
        f.path.startsWith("src/components/precog/") && /<h1\b/.test(f.text) && !NOT_A_TAB[f.path],
    );
    expect(headings.map((f) => f.path).sort()).toEqual([
      "src/components/precog/page-intro.tsx",
      "src/components/precog/start-here.tsx",
    ]);
    for (const f of headings) expect(f.text, f.path).toMatch(/<WordsUsedHere\b/);
  });
});

describe("Start here's words", () => {
  async function startHereHtml(): Promise<string> {
    const { prelude } = await prerender(
      <ReadOnlyPracticeProvider profile={defaultProfile("dental")}>
        <StartHere onOpenDetail={() => {}} />
      </ReadOnlyPracticeProvider>,
    );
    return new Response(prelude).text();
  }

  it("explains the page at about grade 8, with the glossary one press away", async () => {
    const html = await startHereHtml();
    const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
    expect(header).toContain("Words used here");
    const method = textOf(header.slice(header.indexOf("<details")));
    expect(method).not.toMatch(/detective controls|Two headline figures/);
    expect(fkGrade(method.replace(/^How this works /, ""))).toBeLessThanOrEqual(8.5);
  });

  it("says Unverified once above the case list, not on every card", () => {
    const profile = defaultProfile("dental");
    const model = buildStartHereModel({
      profile,
      template: resolveTemplate(profile),
      today: new Date(2026, 8, 26),
    });
    expect(model.footer.cases.length).toBeGreaterThan(5);
    const html = renderToStaticMarkup(<EvidenceFooter model={model.footer} />);
    expect(html.match(/Unverified/g)).toHaveLength(1);
  });
});

describe("the Plain and Tactical toggle", () => {
  it("says what it changes on screen, not only on hover", () => {
    const html = renderToStaticMarkup(<PresentationToggle />);
    expect(textOf(html)).toContain("Changes the words, never the numbers.");
    expect(html).toMatch(/aria-describedby="[^"]+"/);
  });
});

describe("the glossary dialog", () => {
  it("lists the page's words first, folds the rest, and keeps Tactical words out of Plain mode", () => {
    const html = renderToStaticMarkup(<GlossaryDialog tab="monthly" onClose={() => {}} />);
    const text = textOf(html);
    expect(text).toContain("What the words on Monthly review mean in Precog.");
    expect(text.indexOf("Exception")).toBeLessThan(text.indexOf("Other words in Precog"));
    expect(html).toMatch(/<details[^>]*><summary[^>]*>Other words in Precog \(\d+\)<\/summary>/);
    expect(text).not.toMatch(/Tactical word|SoD|Residual risk register/);
  });
});
