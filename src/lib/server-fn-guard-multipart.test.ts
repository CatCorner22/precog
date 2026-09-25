import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { checkServerFnRequest, MAX_SERVER_FN_BODY_BYTES } from "./server-fn-guard";

const URL_BASE = "http://app.test/_serverFn/multipart-regression";

function multipart(boundary: string, contentType = `multipart/form-data; boundary=${boundary}`) {
  const body = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="businessName"',
    "",
    "Example Practice",
    `--${boundary}--`,
    "",
  ].join("\r\n");
  return new Request(URL_BASE, {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });
}

async function statusOf(request: Request, limit = MAX_SERVER_FN_BODY_BYTES) {
  return (await checkServerFnRequest(request, limit))?.status ?? null;
}

describe("server-function multipart regression", () => {
  it("accepts a mixed-case boundary without changing the original header or body", async () => {
    const request = multipart("----WebKitFormBoundaryAbC123xYz");
    const header = request.headers.get("content-type");
    const original = await request.clone().text();
    assert.equal(await statusOf(request), null);
    assert.equal(request.headers.get("content-type"), header);
    assert.equal(await request.text(), original);
  });

  it("accepts a quoted mixed-case boundary containing punctuation", async () => {
    const request = multipart(
      "Boundary:AbC/123",
      'multipart/form-data; boundary="Boundary:AbC/123"',
    );
    assert.equal(await statusOf(request), null);
    assert.equal((await request.formData()).get("businessName"), "Example Practice");
  });

  it("continues to accept a lowercase boundary", async () => {
    assert.equal(await statusOf(multipart("lowercase-boundary-123")), null);
  });

  it("matches media types case-insensitively but preserves the boundary case", async () => {
    const request = multipart("CaseSensitiveAbC", "Multipart/Form-Data; boundary=CaseSensitiveAbC");
    assert.equal(await statusOf(request), null);
  });

  it("handles additional parameters without changing the boundary", async () => {
    const request = multipart(
      "ParameterAbC",
      "multipart/form-data; charset=UTF-8; boundary=ParameterAbC",
    );
    assert.equal(await statusOf(request), null);
  });

  it("preserves browser-generated multipart fields and binary file bytes", async () => {
    const bytes = new Uint8Array([0, 255, 65, 13, 10, 128, 42]);
    const form = new FormData();
    form.set("businessName", "Example Practice");
    form.set("file", new Blob([bytes], { type: "application/octet-stream" }), "sample.bin");
    const request = new Request(URL_BASE, { method: "POST", body: form });
    assert.equal(await statusOf(request), null);
    const parsed = await request.formData();
    assert.equal(parsed.get("businessName"), "Example Practice");
    const file = parsed.get("file");
    assert.ok(file instanceof Blob);
    assert.deepEqual(new Uint8Array(await file.arrayBuffer()), bytes);
  });

  it("rejects a missing boundary parameter", async () => {
    assert.equal(await statusOf(multipart("MissingAbC", "multipart/form-data")), 400);
  });

  it("rejects a boundary that differs from the body's boundary in case", async () => {
    const request = multipart("ActualAbC", "multipart/form-data; boundary=actualabc");
    assert.equal(await statusOf(request), 400);
  });

  it("rejects a truncated multipart body", async () => {
    const request = new Request(URL_BASE, {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=TruncatedAbC" },
      body: "--TruncatedAbC\r\nContent-Disposition: form-data; name=\"a\"\r\n\r\nincomplete",
    });
    assert.equal(await statusOf(request), 400);
  });

  it("keeps the byte limit inclusive and rejects one byte beyond it", async () => {
    const request = multipart("ByteLimitAbC");
    const size = (await request.clone().arrayBuffer()).byteLength;
    assert.equal(await statusOf(request.clone(), size), null);
    assert.equal(await statusOf(request, size - 1), 413);
  });

  it("rejects a declared oversized multipart body before parsing it", async () => {
    const request = multipart("DeclaredLimitAbC");
    request.headers.set("content-length", String(MAX_SERVER_FN_BODY_BYTES + 1));
    assert.equal(await statusOf(request), 413);
    assert.equal(request.bodyUsed, false);
  });

  it("rejects multipart headers on GET and HEAD", async () => {
    for (const method of ["GET", "HEAD"]) {
      const request = new Request(URL_BASE, {
        method,
        headers: { "content-type": "Multipart/Form-Data; boundary=MethodAbC" },
      });
      assert.equal(await statusOf(request), 400);
    }
  });

  it("continues to accept URL-encoded forms and preserve their fields", async () => {
    const request = new Request(URL_BASE, {
      method: "POST",
      headers: { "content-type": "Application/X-Www-Form-Urlencoded; charset=UTF-8" },
      body: "businessName=Example+Practice&note=A%2BB",
    });
    assert.equal(await statusOf(request), null);
    const parsed = await request.formData();
    assert.equal(parsed.get("businessName"), "Example Practice");
    assert.equal(parsed.get("note"), "A+B");
  });

  it("keeps the supported JSON null document and rejects malformed JSON", async () => {
    const request = (body: string) =>
      new Request(URL_BASE, {
        method: "POST",
        headers: { "content-type": "Application/Json; charset=UTF-8" },
        body,
      });
    assert.equal(await statusOf(request("null")), null);
    assert.equal(await statusOf(request("{broken")), 400);
  });
});
