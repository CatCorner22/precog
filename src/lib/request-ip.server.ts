import { getRequest, getRequestIP } from "@tanstack/react-start/server";
import { clientIpFrom, trustedClientIpHeaders } from "./client-ip";

/**
 * The calling client's address. Forwarding headers count only where the
 * deployment sets them (see client-ip.ts); otherwise this is the socket
 * address, which a client cannot choose.
 */
export function requestIp(): string {
  const request = getRequest();
  if (!request) return "unknown";
  let socketAddress: string | undefined;
  try {
    socketAddress = getRequestIP();
  } catch {
    socketAddress = undefined;
  }
  return clientIpFrom(request.headers, trustedClientIpHeaders(), socketAddress);
}
