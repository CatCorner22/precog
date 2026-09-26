import { describe, expect, it } from "vitest";
import { datesAreDayFirst, readHireDate, tenureFromHireDate } from "./hire-date";

const today = new Date("2026-09-22T00:00:00Z");

describe("readHireDate", () => {
  it("parses the hire-date formats the common exports write", () => {
    expect(readHireDate("2019-03-15", { today })).toBe("2019-03-15");
    expect(readHireDate("03/15/2019", { today })).toBe("2019-03-15");
    expect(readHireDate("3/5/19", { today })).toBe("2019-03-05");
    expect(readHireDate("15-Mar-2019", { today })).toBe("2019-03-15");
    expect(readHireDate("2019-03-15T00:00:00", { today })).toBe("2019-03-15");
    expect(readHireDate("March 2019", { today })).toBeUndefined();
    expect(tenureFromHireDate("2019-03-15", today)).toBe(7.5);
    expect(tenureFromHireDate("2030-01-01", today)).toBe(0);

    const at = { today };
    expect(readHireDate("03/15/2019 12:00:00 AM", at)).toBe("2019-03-15");
    expect(readHireDate("3/15/2019 0:00", at)).toBe("2019-03-15");
    expect(readHireDate("2019-03-15T00:00:00.000Z", at)).toBe("2019-03-15");
    expect(readHireDate("2019-03-15 00:00:00", at)).toBe("2019-03-15");
    expect(readHireDate("Mar 15, 2019", at)).toBe("2019-03-15");
    expect(readHireDate("March 15, 2019", at)).toBe("2019-03-15");
    expect(readHireDate("Sep 1, 2024", at)).toBe("2024-09-01");
    expect(readHireDate("15 March 2019", at)).toBe("2019-03-15");
    expect(readHireDate("01-JAN-19", at)).toBe("2019-01-01");
    expect(readHireDate("2019/03/15", at)).toBe("2019-03-15");
    expect(readHireDate("15.03.2019", at)).toBe("2019-03-15");
    expect(readHireDate("20190315", at)).toBe("2019-03-15");
    expect(readHireDate("2019-02-30", at)).toBeUndefined();
    expect(readHireDate("15/03/2019", at)).toBeUndefined();
    expect(readHireDate("15/03/2019", { ...at, dayFirst: true })).toBe("2019-03-15");
    expect(readHireDate("10/01/2020", { ...at, dayFirst: true })).toBe("2020-01-10");
  });

  it("pivots two-digit years: up to next year is this century, later ones last century", () => {
    const at = { today };
    expect(readHireDate("01/01/99", at)).toBe("1999-01-01");
    expect(readHireDate("01-JAN-99", at)).toBe("1999-01-01");
    expect(readHireDate("01/01/70", at)).toBe("1970-01-01");
    expect(readHireDate("7/4/26", at)).toBe("2026-07-04");
    expect(readHireDate("12/31/27", at)).toBe("2027-12-31");
    expect(readHireDate("01/01/28", at)).toBe("1928-01-01");
    expect(readHireDate("01/01/29", at)).toBe("1929-01-01");
  });
});

describe("datesAreDayFirst", () => {
  it("is true only when some date can only be day first", () => {
    expect(datesAreDayFirst(["03/15/2019", "15/03/2019"])).toBe(true);
    expect(datesAreDayFirst(["03/04/2019", "12/11/2019"])).toBe(false);
  });
});
