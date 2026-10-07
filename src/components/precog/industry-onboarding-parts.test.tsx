import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SeatNote, TitleTicksReview } from "./industry-onboarding-parts";

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe("SeatNote", () => {
  it("names every duty the job title ticked, so none hides off-screen", () => {
    const html = renderToStaticMarkup(
      <SeatNote
        seat={{ title: "Bookkeeper", partial: false }}
        duties={["enter_invoices", "release_payment", "bank_reconcile"]}
      />,
    );
    expect(text(html)).toBe(
      "From the job title: Enter bills, Release payments, Reconcile bank — untick any this person does not do",
    );
  });

  it("keeps the partial-match warning and still names the ticks", () => {
    const html = renderToStaticMarkup(
      <SeatNote seat={{ title: "Bookkeeper", partial: true }} duties={["enter_invoices"]} />,
    );
    expect(text(html)).toContain("Catalog job (partial match): Bookkeeper; check the ticks");
    expect(text(html)).toContain("From the job title: Enter bills — untick");
  });

  it("names the catalog job when the title ticked nothing the row still holds", () => {
    const html = renderToStaticMarkup(
      <SeatNote seat={{ title: "Bookkeeper", partial: false }} duties={[]} />,
    );
    expect(text(html)).toBe("Catalog job: Bookkeeper");
  });
});

describe("TitleTicksReview", () => {
  it("counts the ticks and the people, and links each line to its row", () => {
    const html = renderToStaticMarkup(
      <TitleTicksReview
        items={[
          {
            rowId: "r1",
            who: "Lisa",
            role: "Bookkeeper",
            duties: ["enter_invoices", "create_vendor"],
          },
          { rowId: "r2", who: "Maria", role: "Office Manager", duties: ["prepare_deposit"] },
        ]}
        onShow={() => {}}
      />,
    );
    expect(text(html)).toContain("Precog ticked 3 duties from job titles for 2 people: check them");
    expect(text(html)).toContain("Lisa (Bookkeeper): Enter bills, Set up suppliers");
    expect(text(html)).toContain("Maria (Office Manager): Prepare deposits");
    expect(html).toContain('aria-label="Go to Lisa&#x27;s row"');
  });

  it("uses the singular for one duty and one person, and shows nothing with no ticks", () => {
    const one = renderToStaticMarkup(
      <TitleTicksReview
        items={[{ rowId: "r1", who: "Lisa", role: "Clerk", duties: ["post_payments"] }]}
        onShow={() => {}}
      />,
    );
    expect(text(one)).toContain("Precog ticked 1 duty from job titles for 1 person: check them");
    expect(renderToStaticMarkup(<TitleTicksReview items={[]} onShow={() => {}} />)).toBe("");
  });
});
