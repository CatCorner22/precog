import { expect, test } from "vitest";
import { format } from "./format";

test.each([
  [0.002, "0.002"],
  [0.00144, "0.00144"],
  [-10, "-10"],
  [0, "0"],
  [1234.567, "1,234.57"],
])("formats %s as %s", (value, expected) => {
  expect(format(value)).toBe(expected);
});
