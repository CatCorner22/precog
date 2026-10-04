import { describe, expect, it } from "vitest";
import { renderQuickBooksAlert } from "./alert-email";

const LINK = "https://app.example/firm";
const REFUSED = "QuickBooks no longer accepts this connection. Disconnect and connect again.";

describe("QuickBooks alert email", () => {
  it("names the one client in the subject and says what failed, when, and what the check runs on", () => {
    const mail = renderQuickBooksAlert({
      firmName: "North Advisors",
      items: [
        {
          businessName: "Ortiz Dental",
          kind: "failed",
          detail: REFUSED,
          when: "2026-10-06",
          lastReadOn: "2026-09-01",
        },
      ],
      link: LINK,
    });
    expect(mail.subject).toBe("Precog: QuickBooks needs attention for Ortiz Dental");
    expect(mail.text).toContain(
      "Precog could not read the QuickBooks books of Ortiz Dental on Oct 6, 2026: QuickBooks no longer accepts this connection. Disconnect and connect again. Until it is read again, the monthly check of vendors and payroll runs on the reading of Sep 1, 2026.",
    );
    expect(mail.text).toContain(`Open the firm workspace: ${LINK}`);
    expect(mail.text).toContain(
      "You receive this because Ortiz Dental is connected to QuickBooks in North Advisors on Precog. Precog sends it once per problem.",
    );
    expect(mail.html).toContain("QuickBooks needs attention");
    expect(mail.html).toContain(`<a href="${LINK}">Open the firm workspace</a>`);
    expect(mail.headers).toBeUndefined();
    expect(mail.text).not.toContain("Stop");
  });

  it("leaves the second sentence out without a reading, and says 'an earlier reading' without a day", () => {
    const mail = renderQuickBooksAlert({
      firmName: "North Advisors",
      items: [{ businessName: "Ortiz Dental", kind: "failed", detail: REFUSED, when: null }],
      link: LINK,
    });
    expect(mail.text).toContain(
      `Precog could not read the QuickBooks books of Ortiz Dental on an earlier reading: ${REFUSED}\n`,
    );
    expect(mail.text).not.toContain("Until it is read again");
  });

  it("warns about a permission that is about to end, and one that has ended", () => {
    const mail = renderQuickBooksAlert({
      firmName: "North Advisors",
      items: [
        { businessName: "Ortiz Dental", kind: "lapsing", lapsesOn: "2026-10-20" },
        { businessName: "Hill Dental", kind: "lapsed", lapsesOn: "2026-10-01" },
      ],
      link: LINK,
    });
    expect(mail.subject).toBe("Precog: QuickBooks needs attention for 2 clients");
    expect(mail.text).toContain(
      "QuickBooks' permission for Ortiz Dental ends on Oct 20, 2026. Open the client and read the books before then to renew it, or connect QuickBooks again after.",
    );
    expect(mail.text).toContain(
      "QuickBooks' permission for Hill Dental ended on Oct 1, 2026, so the monthly reading has stopped. Open the client, disconnect, then connect QuickBooks again.",
    );
    expect(mail.text).toContain(
      "You receive this because Ortiz Dental and Hill Dental are connected to QuickBooks in North Advisors on Precog. Precog sends it once per problem.",
    );
  });

  it("counts a client once however many problems it has, and escapes names in the html", () => {
    const mail = renderQuickBooksAlert({
      firmName: null,
      items: [
        { businessName: "A <b>Shop</b>", kind: "failed", detail: REFUSED, when: "2026-10-06" },
        { businessName: "A <b>Shop</b>", kind: "lapsing", lapsesOn: "2026-10-20" },
      ],
      link: LINK,
    });
    expect(mail.subject).toBe("Precog: QuickBooks needs attention for A <b>Shop</b>");
    expect(mail.html).toContain("A &lt;b&gt;Shop&lt;/b&gt;");
    expect(mail.html).not.toContain("<b>Shop</b>");
    expect(mail.text).toContain(
      "You receive this because A <b>Shop</b> is connected to QuickBooks in your Precog account.",
    );
  });
});
