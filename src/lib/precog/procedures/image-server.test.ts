import { describe, expect, it } from "vitest";
import { parseUploadInput } from "./image-server";

const valid = {
  expectedAccountId: "u1",
  businessId: "biz_1",
  contentType: "image/png",
  data: "iVBORw0KGgo=",
};

describe("upload request", () => {
  it("accepts a well-formed upload", () => {
    expect(parseUploadInput(valid)).toEqual(valid);
  });

  it("refuses types the app does not store, before decoding anything", () => {
    expect(() => parseUploadInput({ ...valid, contentType: "image/svg+xml" })).toThrow(
      expect.objectContaining({ status: 415 }),
    );
    expect(() => parseUploadInput({ ...valid, contentType: "image/gif" })).toThrow(
      expect.objectContaining({ status: 415 }),
    );
  });

  it("refuses an oversized body, text that is not base64, and a bad business id", () => {
    expect(() => parseUploadInput({ ...valid, data: "A".repeat(900_000) })).toThrow(
      expect.objectContaining({ status: 413 }),
    );
    expect(() => parseUploadInput({ ...valid, data: "<script>" })).toThrow(
      expect.objectContaining({ status: 400 }),
    );
    expect(() => parseUploadInput({ ...valid, businessId: "../x" })).toThrow(
      expect.objectContaining({ status: 400 }),
    );
    expect(() => parseUploadInput(null)).toThrow(expect.objectContaining({ status: 400 }));
  });
});
