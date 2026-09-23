import { describe, expect, it } from "vitest";
import { examplesHeading } from "./johari-pane";

describe("examplesHeading", () => {
  it("does not call a restaurant's examples a dental office reference without saying they carry over", () => {
    expect(examplesHeading("dental")).toBe("Examples from a dental or medical office");
    expect(examplesHeading("restaurant")).toMatch(/same patterns occur in any business/);
  });
});
