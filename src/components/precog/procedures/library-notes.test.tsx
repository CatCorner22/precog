import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getIndustryTemplate } from "@/lib/precog/templates";
import { libraryRows, procedureFromLibrary } from "@/lib/precog/procedures/library";
import { LibraryNotesBox } from "./procedure-editor";

describe("the editor's box of what a procedure kept from Precog's library", () => {
  it("shows the fallback, the records to keep and the source under their headings", () => {
    const row = libraryRows(getIndustryTemplate("general"), [], "general").find(
      (r) => r.recommendation.id === "lib-release-payments",
    )!;
    const html = renderToStaticMarkup(
      <LibraryNotesBox procedure={procedureFromLibrary(row, "general", "2026-10-01")} />,
    );
    expect(html).toContain("From Precog&#x27;s library");
    expect(html).toContain("If one person has to do both halves");
    expect(html).toContain("If one person prepares and releases payments: each week");
    expect(html).toContain("Records to keep with each run");
    expect(html).toContain("<li>Release log</li>");
    expect(html).toContain("Follows");
    expect(html).toContain("Green Book");
    // Shown, never edited.
    expect(html).not.toMatch(/<(?:input|textarea|select)\b/);
  });

  it("shows nothing for a procedure written by hand", () => {
    expect(renderToStaticMarkup(<LibraryNotesBox procedure={{}} />)).toBe("");
  });
});
