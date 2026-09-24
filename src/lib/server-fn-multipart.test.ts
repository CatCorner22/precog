import { describe, expect, it } from "vitest";
import { checkServerFnRequest } from "./server-fn-guard";

function multipart(boundary: string, quoted = false): Request {
  const head = new TextEncoder().encode(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="fixture.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`,
  );
  const tail = new TextEncoder().encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(head.length + 4 + tail.length);
  body.set(head);
  body.set([0, 128, 255, 42], head.length);
  body.set(tail, head.length + 4);
  return new Request("https://example.test/_serverFn/test", {
    method: "POST",
    headers: {
      "content-type": `multipart/form-data; boundary=${quoted ? `"${boundary}"` : boundary}`,
    },
    body,
  });
}

describe("multipart request guard", () => {
  for (const boundary of ["MixedCASEBoundary19", "lowercase-boundary"]) {
    for (const quoted of [false, true]) {
      it(`accepts ${boundary}, quoted=${quoted}, without consuming or altering the original`, async () => {
        const request = multipart(boundary, quoted);
        expect(await checkServerFnRequest(request)).toBeNull();
        const data = await request.formData();
        const file = data.get("file") as File;
        expect(Array.from(new Uint8Array(await file.arrayBuffer()))).toEqual([0, 128, 255, 42]);
      });
    }
  }
  it("rejects malformed forms", async () => {
    const request = new Request("https://example.test/_serverFn/test", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=Case" },
      body: "not multipart",
    });
    expect((await checkServerFnRequest(request))?.status).toBe(400);
  });
  it("retains streamed-body size enforcement", async () => {
    expect((await checkServerFnRequest(multipart("Boundary"), 10))?.status).toBe(413);
  });
  it("still accepts supported JSON and refuses malformed serialized envelopes", async () => {
    for (const [body, status] of [["null", null], ['{"data":{}}', 400]] as const) {
      const request = new Request("https://example.test/_serverFn/test", {
        method: "POST",
        headers: { "content-type": "Application/JSON; charset=UTF-8" },
        body,
      });
      expect((await checkServerFnRequest(request))?.status ?? null).toBe(status);
    }
  });
});
