import { describe, expect, it } from "vitest";
import { getBaseTemplate } from "./active-template";
import { normalizeCustomKnowledge } from "./practice-profile";

const [first, second] = getBaseTemplate("dental").knowledge;

describe("normalizeCustomKnowledge", () => {
  it("keeps confirmations on or before the supplied calendar day and drops later ones", () => {
    const result = normalizeCustomKnowledge(
      [
        { ...first, confirmedAt: "2026-09-21" },
        { ...second, confirmedAt: "2026-09-22" },
      ],
      "2026-09-21",
    );
    expect(result?.map((item) => item.confirmedAt)).toEqual(["2026-09-21", undefined]);
  });

  it("drops malformed dates and passes non-array input through as null", () => {
    expect(
      normalizeCustomKnowledge([{ ...first, confirmedAt: "2026-02-30" }], "2026-09-21"),
    ).toEqual([{ ...first, confirmedAt: undefined }].map(({ confirmedAt: _c, ...rest }) => rest));
    expect(normalizeCustomKnowledge(null, "2026-09-21")).toBeNull();
  });
});
