import { beforeEach, describe, expect, it, vi } from "vitest";

const forwarded = vi.hoisted(() => ({ events: [] as unknown[], ip: "203.0.113.1" }));

vi.mock("@/lib/request-ip.server", () => ({ requestIp: () => forwarded.ip }));
vi.mock("@/lib/observability/report.server", () => ({
  forwardErrorEvent: async (event: unknown) => {
    forwarded.events.push(event);
  },
}));

const { Route } = await import("./errors");

type Handler = (ctx: { request: Request }) => Promise<Response> | Response;
const handlers = (Route.options as unknown as { server: { handlers: Record<string, Handler> } })
  .server.handlers;

const event = {
  message: "boom",
  name: "Error",
  stack: null,
  where: "client",
  at: "/",
  occurredAt: "2026-09-26T10:00:00.000Z",
  release: null,
};

function post(body: string, headers: Record<string, string> = {}): Promise<Response> {
  return Promise.resolve(
    handlers.POST({
      request: new Request("https://x.test/api/errors", { method: "POST", body, headers }),
    }),
  );
}

let address = 0;
beforeEach(() => {
  forwarded.events = [];
  address += 1;
  forwarded.ip = `203.0.113.${address}`;
});

describe("/api/errors", () => {
  it("forwards a well-formed event before answering 204", async () => {
    const res = await post(JSON.stringify(event));
    expect(res.status).toBe(204);
    expect(forwarded.events).toEqual([event]);
  });

  it("refuses a declared or actual body over 16 KB, counting bytes not characters", async () => {
    expect((await post("{}", { "content-length": String(17 * 1024) })).status).toBe(413);
    const multiByte = JSON.stringify({ ...event, message: "é".repeat(9_000) });
    expect(multiByte.length).toBeLessThan(16 * 1024);
    expect((await post(multiByte)).status).toBe(413);
    expect(forwarded.events).toEqual([]);
  });

  it("answers 400 to bad JSON or a wrong shape", async () => {
    expect((await post("{not json")).status).toBe(400);
    expect((await post(JSON.stringify({ ...event, where: "server" }))).status).toBe(400);
  });

  it("lets one address send five reports a minute", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 7; i += 1) statuses.push((await post(JSON.stringify(event))).status);
    expect(statuses).toEqual([204, 204, 204, 204, 204, 429, 429]);
    expect(forwarded.events).toHaveLength(5);
  });

  it("answers 405 to any other method", async () => {
    const res = await handlers.ANY({ request: new Request("https://x.test/api/errors") });
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
  });
});
