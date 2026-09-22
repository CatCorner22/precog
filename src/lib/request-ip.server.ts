import { getRequest } from "@tanstack/react-start/server";

export function requestIp(): string {
  const request = getRequest();
  if (!request) return "unknown";
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}
