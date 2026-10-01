import { describe, expect, it } from "vitest";
import { parseUploadInput, takeUploadAllowance, UPLOADS_PER_MINUTE } from "./image-server";
import { SlidingWindowLimiter } from "../llm/rate-limit";

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

describe("upload allowance", () => {
  it("refuses an account past its uploads a minute, and only that account", () => {
    let now = 0;
    const limiter = new SlidingWindowLimiter(
      { limit: UPLOADS_PER_MINUTE, windowMs: 60_000 },
      () => now,
    );
    for (let i = 0; i < UPLOADS_PER_MINUTE; i++) takeUploadAllowance("u1", limiter);
    expect(() => takeUploadAllowance("u1", limiter)).toThrow(
      expect.objectContaining({ status: 429 }),
    );
    expect(() => takeUploadAllowance("u2", limiter)).not.toThrow();
    now = 61_000;
    expect(() => takeUploadAllowance("u1", limiter)).not.toThrow();
  });
});
