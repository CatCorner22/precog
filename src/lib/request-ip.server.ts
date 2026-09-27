import { getRequest, getRequestIP } from "@tanstack/react-start/server";
import { clientIpFrom, trustedClientIpHeaders } from "./client-ip";

/**
 * The calling client's address. Forwarding headers count only where the
 * deployment sets them (see client-ip.ts); otherwise this is the socket
 * address, which a client cannot choose. Must be called inside a request:
 * outside one, `getRequest()` throws.
 */
export function requestIp(): string {
  return clientIpFrom(getRequest().headers, trustedClientIpHeaders(), getRequestIP());
}
