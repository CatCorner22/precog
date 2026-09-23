import { toJSONAsync } from "seroval";
import { describe, expect, it } from "vitest";
import {
  checkServerFnRequest,
  isUnknownServerFnError,
  MAX_SERVER_FN_BODY_BYTES,
} from "./server-fn-guard";

const URL_BASE = "http://app.test/_serverFn/abc";

/** A body exactly as the app's client encodes a server-function call. */
async function clientBody(data: unknown): Promise<string> {
  return JSON.stringify(await toJSONAsync({ data }));
}

function post(body: BodyInit | null, contentType: string | null = "application/json") {
  const headers = new Headers({ "x-tsr-serverFn": "true" });
  if (contentType) headers.set("content-type", contentType);
  return new Request(URL_BASE, { method: "POST", headers, body });
}

async function statusOf(request: Request, maxBytes?: number): Promise<number | null> {
  const refused = await checkServerFnRequest(request, maxBytes);
  return refused ? refused.status : null;
}

describe("checkServerFnRequest", () => {
  it("lets through what the app's client sends", async () => {
    expect(await statusOf(post(await clientBody({ token: "ab12", passcode: "x" })))).toBeNull();
    expect(
      await statusOf(post(await clientBody({ profile: { staff: { teamSize: 3 } } }))),
    ).toBeNull();
    expect(await statusOf(post(await clientBody(undefined)))).toBeNull();
    const payload = encodeURIComponent(await clientBody({ today: "2026-09-23" }));
    expect(await statusOf(new Request(`${URL_BASE}?payload=${payload}`))).toBeNull();
    expect(await statusOf(new Request(URL_BASE))).toBeNull();
  });

  it("leaves the original body readable for the framework", async () => {
    const body = await clientBody({ token: "ab12" });
    const request = post(body);
    expect(await checkServerFnRequest(request)).toBeNull();
    expect(await request.text()).toBe(body);
  });

  it("answers malformed JSON and non-serialized JSON with 400", async () => {
    expect(await statusOf(post('{"t":10,"i":0,"p":{'))).toBe(400);
    expect(await statusOf(post('{"data":{"token":"abc"}}'))).toBe(400);
    expect(await statusOf(post("[1,2,3]"))).toBe(400);
    expect(await statusOf(post('"text"'))).toBe(400);
    expect(await statusOf(post(""))).toBe(400);
    expect(await statusOf(new Request(`${URL_BASE}?payload=%7Bbad`))).toBe(400);
  });

  it("answers a broken form body, and a form on GET, with 400", async () => {
    expect(await statusOf(post("garbage", "multipart/form-data; boundary=zzz"))).toBe(400);
    expect(
      await statusOf(
        new Request(URL_BASE, { headers: { "content-type": "multipart/form-data; boundary=x" } }),
      ),
    ).toBe(400);
    const form = new FormData();
    form.set("a", "b");
    const valid = new Request(URL_BASE, { method: "POST", body: form });
    expect(await statusOf(valid)).toBeNull();
  });

  it("refuses an oversized body with 413, by header or by reading it", async () => {
    const big = "x".repeat(2_000);
    expect(await statusOf(post(await clientBody(big)), 1_000)).toBe(413);
    // No content-length (a stream): counted while reading.
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 5; i += 1) controller.enqueue(new TextEncoder().encode(big));
        controller.close();
      },
    });
    const streamed = new Request(URL_BASE, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: stream,
      duplex: "half",
    } as RequestInit);
    expect(await statusOf(streamed, 1_000)).toBe(413);
    const declared = new Request(URL_BASE, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(MAX_SERVER_FN_BODY_BYTES + 1),
      },
      body: "{}",
    });
    expect(await statusOf(declared)).toBe(413);
  });

  it("ignores bodies of other content types, which the framework ignores too", async () => {
    expect(await statusOf(post("anything", "text/plain"))).toBeNull();
    expect(await statusOf(post("anything", null))).toBeNull();
  });
});

describe("isUnknownServerFnError", () => {
  it("recognises the framework's unknown-id errors, directly or as a cause", () => {
    expect(isUnknownServerFnError(new Error("Server function info not found for abc"))).toBe(true);
    expect(
      isUnknownServerFnError(
        new Error("HTTPError", { cause: new Error("Invalid server function ID: eyJ") }),
      ),
    ).toBe(true);
    expect(isUnknownServerFnError(new Error("Server function not accessible from client: x"))).toBe(
      true,
    );
  });

  it("leaves every other error alone", () => {
    expect(isUnknownServerFnError(new Error("connection refused"))).toBe(false);
    expect(isUnknownServerFnError(null)).toBe(false);
    expect(isUnknownServerFnError("Server function info not found")).toBe(false);
  });
});
