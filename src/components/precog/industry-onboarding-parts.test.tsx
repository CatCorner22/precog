import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FinishWaitsNote, SeatNote, TitleTicksReview } from "./industry-onboarding-parts";

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe("SeatNote", () => {
  it("names every duty the job title suggested that is not counted yet", () => {
    const html = renderToStaticMarkup(
      <SeatNote
        seat={{ title: "Bookkeeper", partial: false }}
        duties={["enter_invoices", "release_payment", "bank_reconcile"]}
      />,
    );
    expect(text(html)).toBe(
      "From the job title, not counted yet: Enter bills, Release payments, Reconcile bank. Keep or remove each below the table.",
    );
  });

  it("keeps the partial-match warning and still names the suggestions", () => {
    const html = renderToStaticMarkup(
      <SeatNote seat={{ title: "Bookkeeper", partial: true }} duties={["enter_invoices"]} />,
    );
    expect(text(html)).toContain("Catalog job (partial match): Bookkeeper; check the ticks");
    expect(text(html)).toContain("From the job title, not counted yet: Enter bills.");
  });

  it("names the catalog job when every suggestion is decided", () => {
    const html = renderToStaticMarkup(
      <SeatNote seat={{ title: "Bookkeeper", partial: false }} duties={[]} />,
    );
    expect(text(html)).toBe("Catalog job: Bookkeeper");
  });
});

const noop = () => {};
const review = (items: Parameters<typeof TitleTicksReview>[0]["items"]) =>
  renderToStaticMarkup(
    <TitleTicksReview items={items} onShow={noop} onKeep={noop} onRemove={noop} />,
  );

describe("TitleTicksReview", () => {
  it("lists every suggested duty by its full name, column or not, each with Keep and Remove", () => {
    const html = review([
      {
        rowId: "r1",
        who: "Lisa",
        role: "Bookkeeper",
        duties: ["enter_invoices", "post_journal_entries"],
      },
      { rowId: "r2", who: "Maria", role: "Office Manager", duties: ["prepare_deposit"] },
    ]);
    expect(text(html)).toContain("Job titles suggested 3 duties for 2 people: keep or remove each");
    expect(text(html)).toContain("Precog counts a suggested duty only once you keep it.");
    expect(text(html)).toContain("Lisa (Bookkeeper) does these, from the job title:");
    // The no-column duty is in the review, by its full plain name.
    expect(html).toContain('aria-label="Keep Post manual journal entries for Lisa"');
    expect(html).toContain('aria-label="Remove Post manual journal entries from Lisa"');
    expect(html).toContain('aria-label="Keep Enter invoices / bills for Lisa"');
    expect(html).toContain('aria-label="Go to Lisa&#x27;s row"');
    // "Keep all" sits right under the duties it keeps, and only where there are two or more.
    expect(html.indexOf("Keep all 2 for Lisa")).toBeGreaterThan(
      html.indexOf("Remove Post manual journal entries from Lisa"),
    );
    expect(text(html)).not.toContain("Keep all 1");
  });

  it("uses the singular for one duty and one person, and shows nothing once all are decided", () => {
    const one = review([{ rowId: "r1", who: "Lisa", role: "Clerk", duties: ["post_payments"] }]);
    expect(text(one)).toContain("Job titles suggested 1 duty for 1 person: keep or remove each");
    expect(review([])).toBe("");
  });
});

describe("FinishWaitsNote", () => {
  it("says why the finish button waits and links the first person to decide", () => {
    const html = renderToStaticMarkup(
      <FinishWaitsNote
        id="w"
        finishLabel="Show me my gaps"
        waiting={8}
        first={{ rowId: "r1", who: "Ruth", role: "Bookkeeper", duties: ["post_payments"] }}
        onShow={noop}
      />,
    );
    expect(text(html)).toBe(
      "“Show me my gaps” works once you keep or remove each duty a job title suggested: 8 duties left. Start with Ruth",
    );
  });
});
