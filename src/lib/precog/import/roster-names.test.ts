import { describe, expect, it } from "vitest";
import { looksLikeGivenNames, looksLikeSurname, reorderLastFirst } from "./roster-names";

describe("reorderLastFirst", () => {
  it("turns 'Last, First' into 'First Last', keeping generations and credentials", () => {
    expect(reorderLastFirst("Ruiz, Ana")).toBe("Ana Ruiz");
    expect(reorderLastFirst("Diaz, Cal III")).toBe("Cal Diaz III");
    expect(reorderLastFirst("Ruiz, Ana, Jr.")).toBe("Ana Ruiz Jr.");
    expect(reorderLastFirst("Cole, Ben, CPA")).toBe("Ben Cole, CPA");
  });

  it("leaves a credential alone, a company and anything that is not a surname as written", () => {
    expect(reorderLastFirst("Jane Roe, DDS")).toBe("Jane Roe, DDS");
    expect(reorderLastFirst("Acme Payroll, Inc.")).toBe("Acme Payroll, Inc.");
    expect(reorderLastFirst("Smith, Jones & Co")).toBe("Smith, Jones & Co");
    expect(reorderLastFirst("Ana Ruiz")).toBe("Ana Ruiz");
    expect(reorderLastFirst("Unit 4, Store")).toBe("Unit 4, Store");
  });
});

describe("name shapes", () => {
  it("reads one to three words of letters as given names or a surname", () => {
    expect(looksLikeGivenNames("Ana Maria")).toBe(true);
    expect(looksLikeGivenNames("Ana M.")).toBe(true);
    expect(looksLikeGivenNames("Front Desk Evening Shift")).toBe(false);
    expect(looksLikeSurname("de la Cruz", true)).toBe(true);
    expect(looksLikeSurname("Ruiz Lopez", true)).toBe(false);
    expect(looksLikeSurname("Ruiz Lopez")).toBe(true);
  });
});
