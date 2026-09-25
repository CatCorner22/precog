/**
 * Checks on a server-function request before TanStack Start parses it, run
 * from the request middleware in src/start.ts. Without them a truncated JSON
 * body, a body that is not in the framework's serialized format, or a broken
 * form came back as HTTP 500 with the parser's message, and a body of any
 * size was read and decoded before the auth check ran. Uses only web APIs, so
 * it is testable without a server.
 */

/** Largest request body a server function accepts. Vercel's own limit is the same. */
export const MAX_SERVER_FN_BODY_BYTES = 4.5 * 1024 * 1024;
/** Largest GET `payload` parameter, the framework's own cap. */
const MAX_SERVER_FN_QUERY_CHARS = 1_000_000;

const FORM_TYPES = ["multipart/form-data", "application/x-www-form-urlencoded"];

export function plainResponse(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

const invalid = () => plainResponse(400, "Invalid request");
const tooLarge = () => plainResponse(413, "Request too large");

/**
 * The framework's wire format is a seroval JSON document, as the client's
 * `toJSONAsync` writes it: `{"t": <root node>, "f": <feature flags>, "m": [...]}`
 * (or `null`, which the framework reads as no input). Plain JSON such as
 * `{"data":{}}` or an array made its deserializer throw.
 */
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

/** The body, or null once it passes `limit` bytes (reading stops there). */
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
      // Not awaited: a cancelled branch of a cloned (teed) body only settles
      // once the other branch is cancelled too, and the original is dropped
      // unread with the 413.
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

/**
 * A Response refusing the request (400 malformed, 413 too large), or null to
 * let the framework handle it. The body is read from a clone, so the handler
 * still reads the original.
 */
export async function checkServerFnRequest(
  request: Request,
  maxBodyBytes = MAX_SERVER_FN_BODY_BYTES,
): Promise<Response | null> {
  const method = request.method.toUpperCase();
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  const isForm = FORM_TYPES.some((type) => contentType.includes(type));

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
  if (contentType.includes("application/json")) {
    const text = new TextDecoder().decode(body);
    return parsesAsSerializedDocument(text) ? null : invalid();
  }
  // Any other body is ignored by the framework; the function's own input
  // check answers the missing data.
  return null;
}

/**
 * True for the error the framework throws when no server function has the
 * requested id (production: "Server function info not found for …"; dev:
 * "Invalid server function ID: …"). Anything else is left alone.
 */
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
