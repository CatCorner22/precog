/**
 * Errors a server function throws on purpose, carrying the HTTP status the
 * transport should answer with (see src/start.ts). Safe to import from
 * client and server code alike: nothing here touches the request.
 */
export class RequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "RequestError";
    this.status = status;
  }
}

/** The only message a malformed request gets back; the details stay in the server log. */
export const INVALID_REQUEST_MESSAGE = "Invalid request";

export function invalidRequest(): RequestError {
  return new RequestError(400, INVALID_REQUEST_MESSAGE);
}

/** The input as a plain object, or a 400 when it is missing or not an object. */
export function requireObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw invalidRequest();
  return input as Record<string, unknown>;
}

/** True for an error that names a 4xx status the transport should use. */
export function clientErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("status" in error)) return null;
  const status = (error as { status: unknown }).status;
  return typeof status === "number" && Number.isInteger(status) && status >= 400 && status < 500
    ? status
    : null;
}
