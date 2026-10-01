import { describe, expect, it } from "vitest";
import {
  containedRect,
  fittedSize,
  pictureUrl,
  pointOnPicture,
  redactionRect,
  type ScreenRect,
} from "./image-pipeline";

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

  describe("mapping a drag on screen to the picture", () => {
    // The dialog's canvas element: 860 × 540 on a laptop, picture letterboxed inside.
    const element: ScreenRect = { left: 100, top: 50, width: 860, height: 540 };

    /** Drags between two screen points and returns where the painted box shows on screen. */
    function dragAndPaint(width: number, height: number, from: number[], to: number[]) {
      const drawn = containedRect(element, width, height);
      const a = pointOnPicture(from[0], from[1], drawn);
      const b = pointOnPicture(to[0], to[1], drawn);
      const painted = redactionRect(
        { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y, style: "cover" },
        width,
        height,
      );
      const scale = drawn.width / width;
      return {
        left: drawn.left + painted.x * scale,
        right: drawn.left + (painted.x + painted.w) * scale,
        top: drawn.top + painted.y * scale,
        bottom: drawn.top + (painted.y + painted.h) * scale,
      };
    }

    it("finds a portrait photo centred with bands at the sides", () => {
      expect(containedRect(element, 1200, 1600)).toEqual({
        left: 100 + 227.5,
        top: 50,
        width: 405,
        height: 540,
      });
    });

    it("finds a landscape photo centred with bands above and below", () => {
      expect(containedRect(element, 1600, 900)).toEqual({
        left: 100,
        top: 50 + 28.125,
        width: 860,
        height: 483.75,
      });
    });

    it.each([
      ["portrait", 1200, 1600],
      ["landscape", 1600, 900],
      ["square", 1000, 1000],
      ["very tall", 400, 1600],
    ])("paints the box exactly where the owner dragged on a %s picture", (_, w, h) => {
      const drawn = containedRect(element, w, h);
      // A drag across the middle third of the drawn picture.
      const from = [drawn.left + drawn.width / 3, drawn.top + drawn.height / 3];
      const to = [drawn.left + (drawn.width * 2) / 3, drawn.top + (drawn.height * 2) / 3];
      const shown = dragAndPaint(w, h, from, to);
      // Edges round outward by at most one picture pixel, never inward.
      const slack = drawn.width / w + 1e-9;
      expect(shown.left).toBeLessThanOrEqual(from[0] + 1e-9);
      expect(shown.left).toBeGreaterThanOrEqual(from[0] - slack);
      expect(shown.right).toBeGreaterThanOrEqual(to[0] - 1e-9);
      expect(shown.right).toBeLessThanOrEqual(to[0] + slack);
      expect(shown.top).toBeLessThanOrEqual(from[1] + 1e-9);
      expect(shown.top).toBeGreaterThanOrEqual(from[1] - slack);
      expect(shown.bottom).toBeGreaterThanOrEqual(to[1] - 1e-9);
      expect(shown.bottom).toBeLessThanOrEqual(to[1] + slack);
    });

    it("covers the account number dragged over on a tall phone photo", () => {
      // Element x 240–340 (screen 340–440) is picture fraction 0.03–0.28, not 0.28–0.40.
      const drawn = containedRect(element, 1200, 1600);
      expect(pointOnPicture(340, 300, drawn).x).toBeCloseTo(12.5 / 405);
      expect(pointOnPicture(440, 300, drawn).x).toBeCloseTo(112.5 / 405);
    });

    it("clamps a drag that starts in an empty band to the picture's edge", () => {
      const drawn = containedRect(element, 1200, 1600);
      expect(pointOnPicture(110, 40, drawn)).toEqual({ x: 0, y: 0 });
      expect(pointOnPicture(950, 600, drawn)).toEqual({ x: 1, y: 1 });
    });
  });
});
