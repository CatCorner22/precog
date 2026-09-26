import { describe, expect, it } from "vitest";
import {
  count,
  firstName,
  joinWithAnd,
  joinWithOr,
  nameKey,
  quoted,
  slug,
  stripInvisibleControls,
  titleKey,
  uid,
  verb,
} from "./text";

describe("nameKey", () => {
  it("gives accented and plain spellings of one name the same key", () => {
    expect(nameKey("José Pérez")).toBe(nameKey("Jose  Perez"));
    expect(nameKey(" Maya  Chen ")).toBe(nameKey("maya chen"));
  });

  it("keeps letters outside ASCII", () => {
    expect(nameKey("Łukasz")).not.toBe(nameKey("ukasz"));
  });
});

describe("titleKey", () => {
  it("ignores case, extra spaces and invisible controls", () => {
    expect(titleKey("Office  Manager\t")).toBe("office manager");
    expect(titleKey("Office​ Manager")).toBe("office manager");
  });
});

describe("stripInvisibleControls", () => {
  it("removes direction overrides and byte-order marks", () => {
    expect(stripInvisibleControls("﻿Ana‮ Lee")).toBe("Ana Lee");
  });
});

describe("joinWithAnd", () => {
  it("joins with commas and a final and", () => {
    expect(joinWithAnd([])).toBe("");
    expect(joinWithAnd(["Ana"])).toBe("Ana");
    expect(joinWithAnd(["Ana", "Ben"])).toBe("Ana and Ben");
    expect(joinWithAnd(["Ana", "Ben", "Cal"])).toBe("Ana, Ben and Cal");
  });

  it("counts the rest past max, but never says 'and 1 more'", () => {
    expect(joinWithAnd(["Ana", "Ben", "Cal"], 2)).toBe("Ana, Ben and Cal");
    expect(joinWithAnd(["Ana", "Ben", "Cal", "Dee", "Eve"], 2)).toBe("Ana, Ben and 3 more");
  });
});

describe("joinWithOr and quoted", () => {
  it("lists alternatives the way joinWithAnd lists items", () => {
    expect(joinWithOr(["Ana", "Ben"])).toBe("Ana or Ben");
    expect(joinWithOr(["Ana", "Ben", "Cal"], 2)).toBe("Ana, Ben or Cal");
    expect(joinWithOr(["Ana", "Ben", "Cal", "Dee"], 2)).toBe("Ana, Ben or 2 more");
  });

  it("wraps a name in double quotes", () => {
    expect(quoted("Payroll")).toBe('"Payroll"');
  });
});

describe("count and verb", () => {
  it("agree with the number", () => {
    expect(count(1, "person", "people")).toBe("1 person");
    expect(count(3, "person", "people")).toBe("3 people");
    expect(count(2, "step")).toBe("2 steps");
    expect(verb(1, "is", "are")).toBe("is");
    expect(verb(0, "is", "are")).toBe("are");
  });
});

describe("firstName", () => {
  it("skips an honorific", () => {
    expect(firstName("Dr. Maya Chen")).toBe("Maya");
    expect(firstName("Ana Lee")).toBe("Ana");
    expect(firstName("Dr.")).toBe("Dr.");
  });
});

describe("slug", () => {
  it("caps at 40 characters", () => {
    expect(slug("Bright Smiles Dental of Springfield Missouri LLC")).toBe(
      "bright-smiles-dental-of-springfield-miss",
    );
  });
});

describe("uid", () => {
  it("does not repeat inside one millisecond", () => {
    const ids = Array.from({ length: 2000 }, () => uid("ev"));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toMatch(/^ev_[a-z0-9]+_[a-z0-9]{1,6}$/);
  });
});
