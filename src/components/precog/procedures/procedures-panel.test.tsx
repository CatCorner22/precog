import type { ReactNode } from "react";
import { prerender } from "react-dom/static";
import { describe, expect, it, vi } from "vitest";
import { resolveTemplate } from "@/lib/precog/active-template";
import { defaultProfile, type PracticeProfile } from "@/lib/precog/practice-profile";
import { PresentationProvider } from "@/lib/precog/presentation";
import { libraryRows, procedureFromLibrary } from "@/lib/precog/procedures/library";
import { ReadOnlyPracticeProvider } from "@/lib/precog/read-only-practice";
import { ProceduresPanel } from "./procedures-panel";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  useNavigate: () => () => {},
}));

async function html(profile: PracticeProfile, initialItem?: string): Promise<string> {
  const { prelude } = await prerender(
    <PresentationProvider>
      <ReadOnlyPracticeProvider profile={profile}>
        <ProceduresPanel initialItem={initialItem} />
      </ReadOnlyPracticeProvider>
    </PresentationProvider>,
  );
  return new Response(prelude).text();
}

/** The recommended procedure's list item, as rendered. */
function item(page: string, libraryId: string): string | undefined {
  return page.match(new RegExp(`<li[^>]*id="recommended-${libraryId}"[^>]*>`))?.[0];
}

describe("the Procedures tab opened from a conflict card", () => {
  const profile: PracticeProfile = { ...defaultProfile("general"), procedures: [] };

  it("highlights the recommended procedure the link names, with its Start button", async () => {
    const page = await html(profile, "lib:lib-bank-rec");
    expect(item(page, "lib-bank-rec")).toContain('aria-current="true"');
    expect(page).toContain("The procedure for the duty conflict you came from.");
    expect(page).toContain(
      'aria-label="Start from the recommended procedure: Reconcile the bank account"',
    );
  });

  it("shows a recommendation the link names even when it would sit under Show all", async () => {
    const rows = libraryRows(resolveTemplate(profile), [], profile.industry);
    const plain = await html(profile);
    // One the list does not show before "Show all".
    const hidden = rows.find((r) => !item(plain, r.recommendation.id));
    expect(hidden).toBeDefined();
    const page = await html(profile, `lib:${hidden!.recommendation.id}`);
    expect(item(page, hidden!.recommendation.id)).toContain('aria-current="true"');
  });

  it("opens the business's own procedure when one was started from it", async () => {
    const row = libraryRows(resolveTemplate(profile), [], profile.industry).find(
      (r) => r.recommendation.id === "lib-bank-rec",
    )!;
    const started = procedureFromLibrary(row, profile.industry, "2026-10-01");
    const page = await html(
      { ...profile, procedures: [{ ...started, title: "Our bank reconciliation" }] },
      "lib:lib-bank-rec",
    );
    expect(page).toMatch(/id="procedure-heading"[^>]*>Our bank reconciliation</);
    expect(item(page, "lib-bank-rec")).toBeUndefined();
  });

  it("marks nothing for any other item", async () => {
    const page = await html(profile);
    expect(page).not.toMatch(/<li[^>]*id="recommended-[^"]*"[^>]*aria-current/);
    expect(await html(profile, "lib:lib-nope")).not.toContain("you came from");
  });
});
