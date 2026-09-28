/**
 * What the server checks in an uploaded procedure image before storing it:
 * the bytes are really a JPEG, PNG or WebP (SVG, GIF and anything else are
 * refused, whatever the upload claims), how large the picture is, and the
 * same picture with its metadata segments removed. The browser already
 * re-encodes every image, which drops EXIF and GPS data; this is the second
 * layer, for an upload that did not come through the app's own page.
 *
 * Pure byte handling, no decoding: safe to run on untrusted input, and every
 * read is bounds-checked so a truncated or malformed file is refused rather
 * than read past its end.
 */

export type ImageType = "image/jpeg" | "image/png" | "image/webp";

export interface ImageInfo {
  type: ImageType;
  width: number;
  height: number;
}

/** The type the bytes really are, or null for anything the app does not store. */
export function sniffImageType(bytes: Uint8Array): ImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes.length >= 8 && PNG_SIGNATURE.every((b, i) => bytes[i] === b)) return "image/png";
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return "image/webp";
  }
  return null;
}

/** Type and pixel size, or null when the file is not a readable JPEG, PNG or WebP. */
export function readImageInfo(bytes: Uint8Array): ImageInfo | null {
  const type = sniffImageType(bytes);
  if (!type) return null;
  const size =
    type === "image/jpeg"
      ? jpegSize(bytes)
      : type === "image/png"
        ? pngSize(bytes)
        : webpSize(bytes);
  if (!size || size.width < 1 || size.height < 1) return null;
  return { type, ...size };
}

/**
 * The image with its metadata removed: JPEG APP1–APP15 segments except the
 * colour profile, and comments; PNG text, EXIF and time chunks; WebP EXIF and
 * XMP chunks (with the header flags that announce them cleared). Null when
 * the file's structure cannot be walked to its end.
 */
export function stripImageMetadata(bytes: Uint8Array, type: ImageType): Uint8Array | null {
  if (type === "image/jpeg") return stripJpeg(bytes);
  if (type === "image/png") return stripPng(bytes);
  return stripWebp(bytes);
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_DROPPED = new Set(["eXIf", "tEXt", "iTXt", "zTXt", "tIME"]);
const WEBP_DROPPED = new Set(["EXIF", "XMP "]);

// ── JPEG ────────────────────────────────────────────────────────────────────

/** Start-of-frame markers carry the size; C4, C8 and CC are other tables. */
function isStartOfFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  let size: { width: number; height: number } | null = null;
  const ok = walkJpeg(bytes, (marker, start, end) => {
    if (!size && isStartOfFrame(marker) && end - start >= 9) {
      size = { height: u16be(bytes, start + 5), width: u16be(bytes, start + 7) };
    }
    return true;
  });
  return ok ? size : null;
}

function stripJpeg(bytes: Uint8Array): Uint8Array | null {
  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  const ok = walkJpeg(
    bytes,
    (marker, start, end) => {
      const isColourProfile = marker === 0xe2 && ascii(bytes, start + 4, 11) === "ICC_PROFILE";
      const dropped = (marker >= 0xe1 && marker <= 0xef && !isColourProfile) || marker === 0xfe;
      if (!dropped) kept.push(bytes.subarray(start, end));
      return true;
    },
    (start, end) => kept.push(bytes.subarray(start, end)),
  );
  return ok ? concat(kept) : null;
}

/**
 * Calls `segment(marker, start, end)` for each marker segment after the
 * start-of-image, where [start, end) covers the marker and its payload, and
 * `data(start, end)` for the image data after each start-of-scan. It walks
 * every scan of a progressive JPEG, so metadata between scans is seen as
 * segments too, and it stops at the end-of-image marker (passed to `segment`
 * with no payload), so nothing after it is kept. False when the structure is
 * broken.
 */
function walkJpeg(
  bytes: Uint8Array,
  segment: (marker: number, start: number, end: number) => boolean,
  data?: (start: number, end: number) => void,
): boolean {
  let at = 2;
  while (at + 2 <= bytes.length) {
    if (bytes[at] !== 0xff) return false;
    const marker = bytes[at + 1];
    if (marker === 0xff) {
      at += 1; // fill byte
      continue;
    }
    if (marker === 0xd9) return segment(marker, at, at + 2); // end of image
    if (at + 4 > bytes.length) return false;
    const length = u16be(bytes, at + 2);
    if (length < 2 || at + 2 + length > bytes.length) return false;
    if (!segment(marker, at, at + 2 + length)) return false;
    at += 2 + length;
    if (marker === 0xda) {
      // Image data runs to the next marker that is not a stuffed 0xFF00, a
      // restart marker or a fill byte.
      const from = at;
      while (at + 1 < bytes.length) {
        const next = bytes[at + 1];
        if (bytes[at] === 0xff && next !== 0x00 && next !== 0xff && (next < 0xd0 || next > 0xd7)) {
          break;
        }
        at += 1;
      }
      if (at + 1 >= bytes.length) at = bytes.length; // no end-of-image: keep the data as it is
      data?.(from, at);
      if (at >= bytes.length) return true;
    }
  }
  return false;
}

// ── PNG ─────────────────────────────────────────────────────────────────────

function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24 || ascii(bytes, 12, 4) !== "IHDR") return null;
  return { width: u32be(bytes, 16), height: u32be(bytes, 20) };
}

function stripPng(bytes: Uint8Array): Uint8Array | null {
  const kept: Uint8Array[] = [bytes.subarray(0, 8)];
  let at = 8;
  while (at + 12 <= bytes.length) {
    const length = u32be(bytes, at);
    const type = ascii(bytes, at + 4, 4);
    const end = at + 12 + length;
    if (end > bytes.length) return null;
    if (!PNG_DROPPED.has(type)) kept.push(bytes.subarray(at, end));
    at = end;
    if (type === "IEND") return concat(kept);
  }
  return null;
}

// ── WebP ────────────────────────────────────────────────────────────────────

function webpSize(bytes: Uint8Array): { width: number; height: number } | null {
  let size: { width: number; height: number } | null = null;
  const ok = walkWebp(bytes, (fourcc, dataStart, dataEnd) => {
    if (size) return;
    const length = dataEnd - dataStart;
    if (fourcc === "VP8X" && length >= 10) {
      size = { width: u24le(bytes, dataStart + 4) + 1, height: u24le(bytes, dataStart + 7) + 1 };
    } else if (fourcc === "VP8 " && length >= 10) {
      size = {
        width: u16le(bytes, dataStart + 6) & 0x3fff,
        height: u16le(bytes, dataStart + 8) & 0x3fff,
      };
    } else if (fourcc === "VP8L" && length >= 5 && bytes[dataStart] === 0x2f) {
      const bits = u32le(bytes, dataStart + 1);
      size = { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
  });
  return ok ? size : null;
}

function stripWebp(bytes: Uint8Array): Uint8Array | null {
  const kept: Uint8Array[] = [];
  let vp8x: Uint8Array | null = null;
  const ok = walkWebp(bytes, (fourcc, dataStart, dataEnd, chunkEnd) => {
    if (WEBP_DROPPED.has(fourcc)) return;
    const chunk = bytes.slice(dataStart - 8, chunkEnd);
    if (fourcc === "VP8X" && dataEnd - dataStart >= 10) vp8x = chunk;
    kept.push(chunk);
  });
  if (!ok) return null;
  // The header flags say which metadata chunks follow; say none do.
  if (vp8x) (vp8x as Uint8Array)[8] &= ~(0x08 | 0x04);
  const body = concat(kept);
  const out = new Uint8Array(12 + body.length);
  out.set(bytes.subarray(0, 12));
  writeU32le(out, 4, 4 + body.length);
  out.set(body, 12);
  return out;
}

/**
 * Calls `chunk(fourcc, dataStart, dataEnd, chunkEnd)` for each chunk inside
 * the RIFF container (chunkEnd includes the padding byte). False when a chunk
 * runs past the end of the file.
 */
function walkWebp(
  bytes: Uint8Array,
  chunk: (fourcc: string, dataStart: number, dataEnd: number, chunkEnd: number) => void,
): boolean {
  const riffEnd = Math.min(bytes.length, 8 + u32le(bytes, 4));
  let at = 12;
  while (at + 8 <= riffEnd) {
    const fourcc = ascii(bytes, at, 4);
    const length = u32le(bytes, at + 4);
    const dataStart = at + 8;
    const dataEnd = dataStart + length;
    const chunkEnd = dataEnd + (length % 2);
    if (dataEnd > riffEnd) return false;
    chunk(fourcc, dataStart, dataEnd, Math.min(chunkEnd, riffEnd));
    at = chunkEnd;
  }
  // The last chunk may end on its padding byte, one past the declared size.
  return at === riffEnd || at === riffEnd + 1;
}

// ── Byte helpers ────────────────────────────────────────────────────────────

function ascii(bytes: Uint8Array, at: number, length: number): string {
  if (at + length > bytes.length) return "";
  return String.fromCharCode(...bytes.subarray(at, at + length));
}

function u16be(b: Uint8Array, at: number): number {
  return ((b[at] ?? 0) << 8) | (b[at + 1] ?? 0);
}

function u32be(b: Uint8Array, at: number): number {
  return (
    (((b[at] ?? 0) << 24) |
      ((b[at + 1] ?? 0) << 16) |
      ((b[at + 2] ?? 0) << 8) |
      (b[at + 3] ?? 0)) >>>
    0
  );
}

function u16le(b: Uint8Array, at: number): number {
  return (b[at] ?? 0) | ((b[at + 1] ?? 0) << 8);
}

function u24le(b: Uint8Array, at: number): number {
  return (b[at] ?? 0) | ((b[at + 1] ?? 0) << 8) | ((b[at + 2] ?? 0) << 16);
}

function u32le(b: Uint8Array, at: number): number {
  return (u24le(b, at) | ((b[at + 3] ?? 0) << 24)) >>> 0;
}

function writeU32le(b: Uint8Array, at: number, value: number): void {
  b[at] = value & 0xff;
  b[at + 1] = (value >>> 8) & 0xff;
  b[at + 2] = (value >>> 16) & 0xff;
  b[at + 3] = (value >>> 24) & 0xff;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
