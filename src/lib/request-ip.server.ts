import { getRequest } from "@tanstack/react-start/server";

export function requestIp(): string {
  const request = getRequest();
  if (!request) return "unknown";
  // x-real-ip is set by the platform; x-forwarded-for's first entry can be
  // supplied by the client, so it is the fallback, not the first choice.
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "unknown";
}
