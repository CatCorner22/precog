import { describe, expect, it } from "vitest";
import {
  clientErrorStatus,
  INVALID_REQUEST_MESSAGE,
  invalidRequest,
  RequestError,
  requireObject,
} from "./request-errors";

describe("request errors", () => {
  it("invalidRequest is a 400 with the generic message", () => {
    const error = invalidRequest();
    expect(error).toBeInstanceOf(RequestError);
    expect(error.status).toBe(400);
    expect(error.message).toBe(INVALID_REQUEST_MESSAGE);
  });

  it("requireObject passes plain objects and refuses everything else", () => {
    expect(requireObject({ a: 1 })).toEqual({ a: 1 });
    for (const bad of [undefined, null, "x", 5, [], true]) {
      expect(() => requireObject(bad)).toThrow(INVALID_REQUEST_MESSAGE);
    }
  });

  it("clientErrorStatus reads only integer 4xx statuses", () => {
    expect(clientErrorStatus(new RequestError(413, "big"))).toBe(413);
    expect(clientErrorStatus(Object.assign(new Error("Unauthorized"), { status: 401 }))).toBe(401);
    expect(clientErrorStatus(Object.assign(new Error("boom"), { status: 500 }))).toBeNull();
    expect(clientErrorStatus(Object.assign(new Error("odd"), { status: "404" }))).toBeNull();
    expect(clientErrorStatus(new Error("plain"))).toBeNull();
    expect(clientErrorStatus(null)).toBeNull();
  });
});
