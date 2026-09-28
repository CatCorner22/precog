import { describe, expect, it } from "vitest";
import { readImageInfo, sniffImageType, stripImageMetadata } from "./image-bytes";

/** Builders for small, structurally valid files; the checks walk structure, not pixels. */
const bytes = (...parts: (number[] | Uint8Array | string)[]) => {
  const flat: number[] = [];
  for (const p of parts) {
    if (typeof p === "string") for (const c of p) flat.push(c.charCodeAt(0));
    else flat.push(...p);
  }
  return new Uint8Array(flat);
};
const be16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const be32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const le32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
const le24 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff];
const has = (haystack: Uint8Array, needle: string) =>
  new TextDecoder("latin1").decode(haystack).includes(needle);

function jpeg(): Uint8Array {
  const segment = (marker: number, payload: Uint8Array) =>
    bytes([0xff, marker], be16(payload.length + 2), payload);
  return bytes(
    [0xff, 0xd8],
    segment(0xe0, bytes("JFIF", [0, 1, 1, 0, 0, 1, 0, 1, 0, 0])),
    segment(0xe1, bytes("Exif", [0, 0], "GPSLatitude 40.7128")),
    segment(0xe2, bytes("ICC_PROFILE", [0, 1, 1], "sRGB")),
    segment(0xfe, bytes("Taken by Dana at 12 Elm St")),
    segment(0xc0, bytes([8], be16(480), be16(640), [1, 1, 0x11, 0])),
    segment(0xda, bytes([1, 1, 0, 0, 0x3f, 0])),
    [0x12, 0x34, 0x56, 0xff, 0xd9],
  );
}

function png(): Uint8Array {
  const chunk = (type: string, data: Uint8Array) =>
    bytes(be32(data.length), type, data, [0, 0, 0, 0]);
  return bytes(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    chunk("IHDR", bytes(be32(800), be32(600), [8, 6, 0, 0, 0])),
    chunk("tEXt", bytes("Author", [0], "Dana")),
    chunk("eXIf", bytes("GPSLatitude")),
    chunk("IDAT", bytes([1, 2, 3, 4])),
    chunk("IEND", new Uint8Array()),
  );
}

function webp(): Uint8Array {
  const chunk = (fourcc: string, data: Uint8Array) =>
    bytes(fourcc, le32(data.length), data, data.length % 2 ? [0] : []);
  const body = bytes(
    chunk("VP8X", bytes([0x08 | 0x04, 0, 0, 0], le24(1279), le24(719))),
    chunk("VP8L", bytes([0x2f, 0, 0, 0, 0])),
    chunk("EXIF", bytes("GPSLatitude 40")),
    chunk("XMP ", bytes("<x:xmpmeta/>")),
  );
  return bytes("RIFF", le32(4 + body.length), "WEBP", body);
}

describe("sniffing the real type", () => {
  it("recognises JPEG, PNG and WebP from their bytes", () => {
    expect(sniffImageType(jpeg())).toBe("image/jpeg");
    expect(sniffImageType(png())).toBe("image/png");
    expect(sniffImageType(webp())).toBe("image/webp");
  });

  it("refuses SVG, GIF, HTML and empty input", () => {
    expect(sniffImageType(bytes('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(sniffImageType(bytes("GIF89a", [0, 0, 0, 0]))).toBeNull();
    expect(sniffImageType(bytes("<html><script>alert(1)</script>"))).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });
});

describe("reading the size", () => {
  it("reads width and height of each type", () => {
    expect(readImageInfo(jpeg())).toEqual({ type: "image/jpeg", width: 640, height: 480 });
    expect(readImageInfo(png())).toEqual({ type: "image/png", width: 800, height: 600 });
    expect(readImageInfo(webp())).toEqual({ type: "image/webp", width: 1280, height: 720 });
  });

  it("refuses a truncated file instead of reading past its end", () => {
    const cut = jpeg().subarray(0, 30);
    expect(readImageInfo(cut)).toBeNull();
    expect(readImageInfo(png().subarray(0, 20))).toBeNull();
  });
});

describe("stripping metadata", () => {
  it("drops JPEG EXIF and comments and keeps the colour profile and the scan", () => {
    const out = stripImageMetadata(jpeg(), "image/jpeg")!;
    expect(has(out, "GPSLatitude")).toBe(false);
    expect(has(out, "Taken by Dana")).toBe(false);
    expect(has(out, "ICC_PROFILE")).toBe(true);
    expect(readImageInfo(out)).toEqual({ type: "image/jpeg", width: 640, height: 480 });
    expect([...out.subarray(-2)]).toEqual([0xff, 0xd9]);
  });

  it("drops metadata between the scans of a progressive JPEG, and anything after its end", () => {
    const segment = (marker: number, payload: Uint8Array) =>
      bytes([0xff, marker], be16(payload.length + 2), payload);
    const progressive = bytes(
      [0xff, 0xd8],
      segment(0xc2, bytes([8], be16(480), be16(640), [1, 1, 0x11, 0])),
      segment(0xda, bytes([1, 1, 0, 0, 0x3f, 0])),
      [0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56],
      segment(0xe1, bytes("Exif", [0, 0], "GPSLatitude 51.5")),
      segment(0xfe, bytes("Taken by Dana")),
      segment(0xda, bytes([1, 1, 0, 0, 0x3f, 0])),
      [0x78, 0x5a],
      [0xff, 0xd9],
      bytes("TRAILER secret"),
    );
    const out = stripImageMetadata(progressive, "image/jpeg")!;
    expect(has(out, "GPSLatitude")).toBe(false);
    expect(has(out, "Taken by Dana")).toBe(false);
    expect(has(out, "TRAILER")).toBe(false);
    expect([...out.subarray(-2)]).toEqual([0xff, 0xd9]);
    // Both scans, with their stuffed byte and restart marker, are kept as they were.
    expect(has(out, "\x12\xff\x00\x34\xff\xd0\x56")).toBe(true);
    expect(has(out, "\x78\x5a")).toBe(true);
    expect(readImageInfo(out)).toEqual({ type: "image/jpeg", width: 640, height: 480 });
  });

  it("drops PNG text and EXIF chunks", () => {
    const out = stripImageMetadata(png(), "image/png")!;
    expect(has(out, "Dana")).toBe(false);
    expect(has(out, "GPSLatitude")).toBe(false);
    expect(has(out, "IDAT")).toBe(true);
    expect(readImageInfo(out)?.width).toBe(800);
  });

  it("drops WebP EXIF and XMP, clears their header flags and fixes the size", () => {
    const out = stripImageMetadata(webp(), "image/webp")!;
    expect(has(out, "GPSLatitude")).toBe(false);
    expect(has(out, "xmpmeta")).toBe(false);
    const riffSize = out[4] | (out[5] << 8) | (out[6] << 16) | (out[7] << 24);
    expect(riffSize).toBe(out.length - 8);
    expect(out[20] & 0x0c).toBe(0);
    expect(readImageInfo(out)).toEqual({ type: "image/webp", width: 1280, height: 720 });
  });
});
