/**
 * What the browser does to a screenshot or photo before it leaves the
 * device: turn it upright, shrink it, cover or pixelate what the owner
 * marked, and re-encode it. Drawing the picture onto a canvas and encoding
 * that canvas keeps the pixels and drops everything else the file carried
 * (EXIF, GPS position, camera and owner names), so the original file is
 * never uploaded.
 */

/** A marked area, as fractions (0–1) of the picture's width and height. */
export interface Redaction {
  x: number;
  y: number;
  width: number;
  height: number;
  /** "cover" paints it solid; "pixelate" replaces it with coarse blocks. */
  style: "cover" | "pixelate";
}

/** Longest side of an uploaded picture, in pixels. */
export const MAX_SIDE = 1600;
/** Target size of an encoded picture; quality steps down until it fits. */
export const TARGET_BYTES = 400 * 1024;

/** The picture, upright, ready to draw. */
export async function loadPicture(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: "from-image" });
}

/** The size the picture is drawn at: its own size, or scaled so the longest side is `max`. */
export function fittedSize(
  width: number,
  height: number,
  max = MAX_SIDE,
): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** A redaction's area in pixels on a canvas of this size, clamped to the canvas. */
export function redactionRect(
  r: Redaction,
  width: number,
  height: number,
): { x: number; y: number; w: number; h: number } {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const x0 = clamp(Math.min(r.x, r.x + r.width));
  const y0 = clamp(Math.min(r.y, r.y + r.height));
  const x1 = clamp(Math.max(r.x, r.x + r.width));
  const y1 = clamp(Math.max(r.y, r.y + r.height));
  // Edges round outward, so the area painted always covers the area marked.
  const x = Math.floor(x0 * width);
  const y = Math.floor(y0 * height);
  return { x, y, w: Math.ceil(x1 * width) - x, h: Math.ceil(y1 * height) - y };
}

/** A rectangle on screen, in CSS pixels. */
export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Where a picture of `width` × `height` pixels is drawn inside `box` with
 * object-fit: contain: scaled to fit and centred, with empty bands at the
 * sides (a tall picture) or above and below (a wide one). Pointer positions
 * and the outlines over the picture are measured against this rectangle, not
 * the element's, or a box drawn on a tall photo lands beside what was marked.
 */
export function containedRect(box: ScreenRect, width: number, height: number): ScreenRect {
  if (width <= 0 || height <= 0 || box.width <= 0 || box.height <= 0) return box;
  const scale = Math.min(box.width / width, box.height / height);
  const w = width * scale;
  const h = height * scale;
  return {
    left: box.left + (box.width - w) / 2,
    top: box.top + (box.height - h) / 2,
    width: w,
    height: h,
  };
}

/** A pointer position as fractions (0–1) of the drawn picture, clamped to its edges. */
export function pointOnPicture(
  clientX: number,
  clientY: number,
  picture: ScreenRect,
): { x: number; y: number } {
  const clamp = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
  return {
    x: clamp((clientX - picture.left) / picture.width),
    y: clamp((clientY - picture.top) / picture.height),
  };
}

/**
 * Draws the picture at its fitted size with every redaction applied. Covered
 * areas are painted solid. Pixelated areas are reduced to blocks at least
 * 16 pixels wide, then smoothed, which makes text in them unreadable (a plain
 * blur on its own can sometimes be reversed).
 */
export function renderRedacted(
  picture: CanvasImageSource & { width: number; height: number },
  redactions: readonly Redaction[],
  canvas: HTMLCanvasElement = document.createElement("canvas"),
): HTMLCanvasElement {
  const { width, height } = fittedSize(picture.width, picture.height);
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot prepare pictures.");
  ctx.drawImage(picture, 0, 0, width, height);
  for (const r of redactions) {
    const { x, y, w, h } = redactionRect(r, width, height);
    if (w < 1 || h < 1) continue;
    if (r.style === "cover") {
      ctx.fillStyle = "#111";
      ctx.fillRect(x, y, w, h);
      continue;
    }
    const block = Math.max(16, Math.round(Math.min(w, h) / 6));
    const small = document.createElement("canvas");
    small.width = Math.max(1, Math.ceil(w / block));
    small.height = Math.max(1, Math.ceil(h / block));
    const sctx = small.getContext("2d");
    if (!sctx) continue;
    sctx.drawImage(canvas, x, y, w, h, 0, 0, small.width, small.height);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, small.width, small.height, x, y, w, h);
    ctx.restore();
  }
  return canvas;
}

/**
 * The canvas as WebP (or JPEG where the browser cannot write WebP), with the
 * quality lowered step by step until it is under `target` bytes.
 */
export async function encodePicture(
  canvas: HTMLCanvasElement,
  target = TARGET_BYTES,
): Promise<Blob> {
  let type: "image/webp" | "image/jpeg" = "image/webp";
  let last: Blob | null = null;
  for (const quality of [0.85, 0.75, 0.65, 0.55, 0.45]) {
    const blob = await toBlob(canvas, type, quality);
    // Browsers that cannot write WebP fall back to PNG; switch to JPEG.
    if (type === "image/webp" && blob.type !== "image/webp") {
      type = "image/jpeg";
      last = await toBlob(canvas, type, quality);
    } else {
      last = blob;
    }
    if (last.size <= target) return last;
  }
  if (!last) throw new Error("This browser cannot prepare pictures.");
  return last;
}

/** A blob's bytes as base64, for the upload request. */
export async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** Where the app serves a stored step picture. */
export function pictureUrl(businessId: string, imageId: string): string {
  return `/api/procedure-image?b=${encodeURIComponent(businessId)}&id=${encodeURIComponent(imageId)}`;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("This browser cannot prepare pictures."))),
      type,
      quality,
    ),
  );
}
