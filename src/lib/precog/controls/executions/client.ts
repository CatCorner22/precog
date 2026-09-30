import type { CustomFetch } from "@tanstack/react-start";
import { clientErrorStatus, RequestError } from "@/lib/request-errors";

/**
 * The RPC error serializer retains the message but drops a custom status.
 * Capture the actual HTTP status through the supported per-call fetch hook
 * without reading or replacing the response body. A known rejection can then
 * explain how to correct the entry; network and server failures remain
 * uncertain and retain the same command for a safe, idempotent retry.
 */
export async function withExecutionHttpStatus<T>(
  call: (fetch: CustomFetch) => Promise<T>,
): Promise<T> {
  let status: number | null = null;
  const request: CustomFetch = async (...args) => {
    const response = await globalThis.fetch(...args);
    status = clientErrorStatus({ status: response.status });
    return response;
  };
  try {
    return await call(request);
  } catch (error) {
    if (status !== null && error instanceof Error) throw new RequestError(status, error.message);
    throw error;
  }
}
