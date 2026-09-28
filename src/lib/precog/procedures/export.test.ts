import { describe, expect, it } from "vitest";
import {
  exportFileName,
  procedureMarkdown,
  proceduresJson,
  proceduresMarkdown,
  type ExportContext,
} from "./export";
import { newProcedure, newStep, verifyProcedure } from "./lifecycle";
import { withProof } from "./proof";
import type { Procedure } from "./types";

const TODAY = "2026-09-28";
const ctx: ExportContext = {
  places: [
    { id: "qbo", kind: "software", name: "QuickBooks Online" },
    { id: "safe", kind: "physical", name: "Front-office safe" },
  ],
  nameOf: (id) => (id ? ({ p1: "Ada Owner", p2: "Bea Books" }[id] ?? null) : null),
  itemName: (id) => ({ rec: "Bank reconciliation" })[id],
  today: TODAY,
};

function reconcile(): Procedure {
  return verifyProcedure(
    newProcedure(
      {
        id: "proc-rec",
        industry: "general",
        title: "Reconcile the *checking* account",
        placeId: "qbo",
        module: "Banking › Reconcile",
        url: "https://qbo.intuit.com/app/reconcile",
        purpose: "# Keeps the books matching the bank.",
        trigger: "When the statement arrives",
        prerequisites: ["Bookkeeper login"],
        steps: [
          { ...newStep("Open Banking\nand choose checking."), caution: "Do not click Undo." },
          { ...newStep("Photograph the signed report."), requiresPhoto: true, imageIds: ["img_a"] },
          { ...newStep("Match each line."), aiDrafted: true },
          newStep("   "),
        ],
        knowledgeIds: ["rec"],
        ownerPersonId: "p1",
        backupPersonIds: ["p2"],
      },
      "2026-09-01",
    ),
    "owner",
    "2026-09-10",
  );
}

describe("a procedure as Markdown", () => {
  it("reads in the order a stand-in follows it, with owner text escaped", () => {
    const p = reconcile();
    // Verifying clears the mark, so put it back on one step to see how it reads.
    p.steps[2] = { ...p.steps[2], aiDrafted: true };
    const md = procedureMarkdown(p, ctx);
    expect(md).toContain("# Reconcile the \\*checking\\* account\n");
    expect(md).toContain("**Where:** QuickBooks Online › Banking › Reconcile");
    expect(md).toContain("**Link:** <https://qbo.intuit.com/app/reconcile>");
    expect(md).toContain("**Status:** Verified Sep 10, 2026; check again by Mar 9, 2027");
    expect(md).toContain("\n\\# Keeps the books matching the bank.\n");
    expect(md).toContain("## What you need first\n\n- Bookkeeper login");
    expect(md).toContain(
      "1. Open Banking and choose checking.\n   **Caution:** Do not click Undo.",
    );
    expect(md).toContain(
      "2. Photograph the signed report.\n   _Take a photo as you do this step._",
    );
    expect(md).toContain("   _1 picture in Precog._");
    expect(md).toContain("3. Match each line.\n   _Drafted by Grok; not yet checked by a person._");
    expect(md).not.toContain("4.");
    p.steps[2] = { ...p.steps[2], aiDrafted: undefined, suggested: true };
    expect(procedureMarkdown(p, ctx)).toContain(
      "3. Match each line.\n   _Suggested common practice; not yet fitted to this business._",
    );
    expect(md).toContain("- Does it today: Ada Owner");
    expect(md).toContain("- Can follow it when that person is out: Bea Books");
    expect(md).toContain("- Covers on Who knows what: Bank reconciliation");
  });

  it("keeps owner text from turning into code, rules, headings or nested lists", () => {
    const p = {
      ...newProcedure({ industry: "general", title: "Close" }, TODAY),
      purpose: "~~~ keep the bag locked",
      prerequisites: ["- tick each"],
      steps: [newStep("# Totals"), newStep("---"), newStep("1. Keep the bag locked")],
    };
    const md = procedureMarkdown(p, ctx);
    expect(md).toContain("\n\\~\\~\\~ keep the bag locked\n");
    expect(md).toContain("- \\- tick each");
    expect(md).toContain("1. \\# Totals");
    expect(md).toContain("2. \\---");
    expect(md).toContain("3. 1\\. Keep the bag locked");
    expect(md).not.toMatch(/^~~~/m);
    expect(md).not.toMatch(/^---$/m);
  });

  it("numbers steps as the view does, keeping one that is only a caution", () => {
    const p = {
      ...newProcedure({ industry: "general", title: "Close" }, TODAY),
      steps: [
        newStep("Count the drawer."),
        { ...newStep(""), caution: "Do not press Undo." },
        newStep(""),
        { ...newStep(""), requiresPhoto: true as const },
        newStep("Seal the bag."),
      ],
    };
    const md = procedureMarkdown(p, ctx);
    expect(md).toContain("1. Count the drawer.\n2. **Caution:** Do not press Undo.\n");
    expect(md).toContain("3. _Take a photo as you do this step._\n4. Seal the bag.");
  });

  it("names the account that recorded the verification, when one did", () => {
    const p = verifyProcedure(reconcile(), "owner", "2026-09-10", { id: "u1", name: "Ada Owner" });
    expect(procedureMarkdown(p, ctx)).toContain(
      "**Status:** Verified Sep 10, 2026; check again by Mar 9, 2027; recorded by Ada Owner",
    );
  });

  it("puts every procedure under one heading for the business, one level down", () => {
    const other = newProcedure(
      { id: "proc-safe", industry: "general", title: "Open the safe", placeId: "safe" },
      TODAY,
    );
    const md = proceduresMarkdown([reconcile(), other], "Riverside Plumbing", ctx);
    expect(
      md.startsWith("# Procedures: Riverside Plumbing\n\nExported Sep 28, 2026 · 2 procedures\n"),
    ).toBe(true);
    expect(md).toContain("\n---\n\n## Reconcile the \\*checking\\* account\n");
    expect(md).toContain("### Steps");
    expect(md).toContain("## Open the safe\n");
    expect(md).toContain("No steps yet.");
    expect(md.match(/^# /gm)).toHaveLength(1);
  });
});

describe("procedures as JSON", () => {
  it("keeps every field, the places used and the names of the people named", () => {
    const p = withProof(reconcile(), { personId: "p2", on: "2026-09-20", alone: true });
    const parsed = JSON.parse(proceduresJson([p], "Riverside Plumbing", ctx));
    expect(parsed.format).toBe("precog-procedures");
    expect(parsed.exportedOn).toBe(TODAY);
    expect(parsed.people).toEqual({ p1: "Ada Owner", p2: "Bea Books" });
    expect(parsed.places).toEqual([{ id: "qbo", kind: "software", name: "QuickBooks Online" }]);
    expect(parsed.procedures[0]).toEqual(JSON.parse(JSON.stringify(p)));
  });
});

describe("export file names", () => {
  it("come from the title, with a fallback", () => {
    expect(exportFileName("Reconcile the checking account!", "md")).toBe(
      "reconcile-the-checking-account.md",
    );
    expect(exportFileName("§§", "json")).toBe("procedure.json");
  });
});
