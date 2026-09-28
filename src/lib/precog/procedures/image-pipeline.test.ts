import { describe, expect, it } from "vitest";
import { fittedSize, pictureUrl, redactionRect } from "./image-pipeline";

describe("preparing a picture", () => {
  it("shrinks the longest side to 1600 pixels and never enlarges", () => {
    expect(fittedSize(4032, 3024)).toEqual({ width: 1600, height: 1200 });
    expect(fittedSize(3024, 4032)).toEqual({ width: 1200, height: 1600 });
    expect(fittedSize(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it("turns a marked area into pixels, clamped to the picture, whichever way it was drawn", () => {
    expect(
      redactionRect({ x: 0.5, y: 0.5, width: 0.25, height: 0.25, style: "cover" }, 800, 600),
    ).toEqual({
      x: 400,
      y: 300,
      w: 200,
      h: 150,
    });
    // Dragged up and to the left, and past the edge.
    expect(
      redactionRect({ x: 0.9, y: 0.9, width: -0.2, height: 0.5, style: "pixelate" }, 1000, 1000),
    ).toEqual({
      x: 700,
      y: 900,
      w: 200,
      h: 100,
    });
  });

  it("addresses a stored picture by business and id, escaped", () => {
    expect(pictureUrl("biz_1", "img_a_b")).toBe("/api/procedure-image?b=biz_1&id=img_a_b");
  });
});
