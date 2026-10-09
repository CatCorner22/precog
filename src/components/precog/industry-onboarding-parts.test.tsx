import { describe, expect, it } from "vitest";
import { isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SeatNote, TitleTicksReview } from "./industry-onboarding-parts";

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe("SeatNote", () => {
  it("counts the duties the job title ticked and says to untick the wrong ones, naming none", () => {
    const html = renderToStaticMarkup(
      <SeatNote
        seat={{ title: "Bookkeeper", partial: false }}
        duties={["enter_invoices", "release_payment", "bank_reconcile"]}
      />,
    );
    expect(text(html)).toBe("3 duties ticked from the job title. Untick any that are wrong.");
  });

  it("keeps the partial-match warning beside the count of ticks", () => {
    const html = renderToStaticMarkup(
      <SeatNote seat={{ title: "Bookkeeper", partial: true }} duties={["enter_invoices"]} />,
    );
    expect(text(html)).toContain("Catalog job (partial match): Bookkeeper; check its ticks");
    expect(text(html)).toContain("1 duty ticked from the job title. Untick any that are wrong.");
  });

  it("names the catalog job when every tick is kept", () => {
    const html = renderToStaticMarkup(
      <SeatNote seat={{ title: "Bookkeeper", partial: false }} duties={[]} />,
    );
    expect(text(html)).toBe("Catalog job: Bookkeeper");
  });
});

const noop = () => {};

/** The button in a rendered element tree whose only child is `label`. */
function findButton(node: unknown, label: string): ReactElement<{ onClick: () => void }> {
  const found: ReactElement<{ onClick: () => void }>[] = [];
  const walk = (n: unknown) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!isValidElement(n)) return;
    const props = n.props as { children?: unknown };
    if (n.type === "button" && props.children === label)
      found.push(n as ReactElement<{ onClick: () => void }>);
    walk(props.children);
  };
  walk(node);
  expect(found).toHaveLength(1);
  return found[0];
}
const review = (items: Parameters<typeof TitleTicksReview>[0]["items"]) =>
  renderToStaticMarkup(
    <TitleTicksReview items={items} onShow={noop} onKeep={noop} onRemove={noop} />,
  );

describe("TitleTicksReview", () => {
  it("lists every title tick by its full name, column or not, each with Keep and Remove", () => {
    const html = review([
      {
        rowId: "r1",
        who: "Lisa",
        role: "Bookkeeper",
        duties: ["enter_invoices", "post_journal_entries"],
      },
      { rowId: "r2", who: "Maria", role: "Office Manager", duties: ["prepare_deposit"] },
    ]);
    expect(text(html)).toContain("Job titles ticked 3 duties for 2 people");
    expect(text(html)).toContain("They count now.");
    expect(text(html)).toContain("marked “from the job title” on Team until you confirm it.");
    expect(text(html)).not.toContain("keep or remove each");
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

  it("puts Remove all beside every Keep all, at the same weight, and removes every duty", () => {
    const removed: string[][] = [];
    const items = [
      {
        rowId: "r1",
        who: "Marco",
        role: "Owner",
        duties: ["approve_payroll", "approve_writeoffs"],
      },
      {
        rowId: "r2",
        who: "Lisa",
        role: "Bookkeeper",
        duties: ["enter_invoices", "bank_reconcile"],
      },
    ] as Parameters<typeof TitleTicksReview>[0]["items"];
    const html = review(items);
    expect(html.match(/>Keep all \d+ for /g)).toHaveLength(2);
    expect(html.match(/>Remove all \d+ from /g)).toHaveLength(2);
    const keep = /<button[^>]*class="([^"]*)"[^>]*>Keep all 2 for Marco</.exec(html);
    const remove = /<button[^>]*class="([^"]*)"[^>]*>Remove all 2 from Marco</.exec(html);
    expect(remove).not.toBeNull();
    // Same size and type weight; only the colour says which one removes.
    const weight = (cls: string) =>
      cls.split(" ").filter((c) => !/^(border|bg|text)-(primary|danger)/.test(c));
    expect(weight(remove![1])).toEqual(weight(keep![1]));
    // Right beside Keep all, before the next person.
    expect(html.indexOf("Remove all 2 from Marco")).toBeGreaterThan(
      html.indexOf("Keep all 2 for Marco"),
    );
    expect(html.indexOf("Remove all 2 from Marco")).toBeLessThan(html.indexOf("Lisa"));
    const tree = TitleTicksReview({
      items,
      onShow: noop,
      onKeep: noop,
      onRemove: (_rowId, duties) => removed.push([...duties]),
    });
    const button = findButton(tree, "Remove all 2 from Marco");
    button.props.onClick();
    expect(removed).toEqual([["approve_payroll", "approve_writeoffs"]]);
  });

  it("uses the singular for one duty and one person, and shows nothing once all are kept", () => {
    const one = review([{ rowId: "r1", who: "Lisa", role: "Clerk", duties: ["post_payments"] }]);
    expect(text(one)).toContain("Job titles ticked 1 duty for 1 person");
    expect(review([])).toBe("");
  });
});
