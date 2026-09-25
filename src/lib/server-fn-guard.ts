/** Validate server-function envelopes before framework deserialization. */
export const MAX_SERVER_FN_BODY_BYTES = 4.5 * 1024 * 1024;
export const MAX_SERVER_FN_QUERY_CHARS = 1_000_000;
const FORM_TYPES = ["multipart/form-data", "application/x-www-form-urlencoded"];

export function plainResponse(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}
const invalid = () => plainResponse(400, "Invalid request");
const tooLarge = () => plainResponse(413, "Request too large");

function isSerializedDocument(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value !== "object" || Array.isArray(value)) return false;
  const doc = value as { t?: unknown; f?: unknown; m?: unknown };
  return (
    typeof doc.t === "object" &&
    doc.t !== null &&
    !Array.isArray(doc.t) &&
    typeof doc.f === "number" &&
    Array.isArray(doc.m)
  );
}
function parsesAsSerializedDocument(text: string): boolean {
  try {
    return isSerializedDocument(JSON.parse(text));
  } catch {
    return false;
  }
}

async function readBody(request: Request, limit: number): Promise<Uint8Array<ArrayBuffer> | null> {
  const stream = request.clone().body;
  if (!stream) return new Uint8Array(0);
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      // Do not await cancellation of one branch of a teed body.
      void reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function checkServerFnRequest(
  request: Request,
  maxBodyBytes = MAX_SERVER_FN_BODY_BYTES,
): Promise<Response | null> {
  const method = request.method.toUpperCase();
  // MIME media types are case-insensitive; parameter values, including the
  // multipart boundary, are not. Pass the untouched header to the parser.
  const contentType = request.headers.get("content-type") ?? "";
  const mediaType = contentType.split(";", 1)[0].trim().toLowerCase();
  const isForm = FORM_TYPES.includes(mediaType);

  if (method === "GET" || method === "HEAD") {
    if (isForm) return invalid();
    const payload = new URL(request.url).searchParams.get("payload");
    if (payload === null) return null;
    if (payload.length > MAX_SERVER_FN_QUERY_CHARS) return tooLarge();
    return parsesAsSerializedDocument(payload) ? null : invalid();
  }
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBodyBytes) return tooLarge();
  const body = await readBody(request, maxBodyBytes);
  if (body === null) return tooLarge();
  if (isForm) {
    try {
      await new Response(body, { headers: { "content-type": contentType } }).formData();
      return null;
    } catch {
      return invalid();
    }
  }
  if (mediaType === "application/json") {
    return parsesAsSerializedDocument(new TextDecoder().decode(body)) ? null : invalid();
  }
  return null;
}

export function isUnknownServerFnError(error: unknown): boolean {
  const messages: string[] = [];
  for (let e: unknown = error, depth = 0; e && depth < 3; depth += 1) {
    const message = (e as { message?: unknown }).message;
    if (typeof message === "string") messages.push(message);
    e = (e as { cause?: unknown }).cause;
  }
  return messages.some((m) =>
    /invalid server function id|server function (info not found|not accessible|module (export )?not resolved)/i.test(
      m,
    ),
  );
}
