import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { describe, expect, it } from "vitest";

const token = "test-only-token";
const health = "/api/health";
const digest = "/api/cron/digest";

async function listen(server, port = 0) {
  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}

async function close(server) {
  if (server.listening) await new Promise((resolve) => server.close(resolve));
}

function runDigest(port) {
  const child = spawn("bash", ["deploy/self-host/digest.sh"], {
    env: { ...process.env, PORT: String(port), CRON_SECRET: token },
    stdio: "ignore",
  });
  return once(child, "exit").then(([code]) => code);
}

describe("self-hosted digest readiness", () => {
  it("waits for Node to listen and sends exactly one digest", async () => {
    const requests = [];
    const server = createServer((req, res) => {
      requests.push([req.url, req.headers.authorization]);
      res.end("ok");
    });
    const port = await listen(server);
    await close(server);
    const startedAt = Date.now();
    const result = runDigest(port);
    try {
      await delay(250);
      await listen(server, port);
      expect(await result).toBe(0);
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(1_900);
      expect(requests).toEqual([
        [health, undefined],
        [digest, `Bearer ${token}`],
      ]);
    } finally {
      await close(server);
    }
  });

  it.each([
    [health, [health]],
    [digest, [health, digest]],
  ])("does not retry an HTTP error from %s", async (failingPath, expected) => {
    const requests = [];
    const server = createServer((req, res) => {
      requests.push(req.url);
      res.writeHead(req.url === failingPath ? 503 : 200).end();
    });
    try {
      expect(await runDigest(await listen(server))).toBe(22);
      expect(requests).toEqual(expected);
    } finally {
      await close(server);
    }
  });
});
