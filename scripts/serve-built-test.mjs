/** Serve the actual compiled Vercel entry through a local HTTP adapter, not vite dev. */
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { authTestEnvironment } from "./lib/auth-test-env.mjs";
const { base } = authTestEnvironment();
const entry = await import(
  pathToFileURL(resolve(".vercel/output/functions/__server.func/index.mjs")).href
);
const root = resolve(".vercel/output/static");
const mime = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".txt": "text/plain",
};
const tasks = new Set();
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", base);
    // Vercel answers a request from the static output first (built assets and
    // the files copied from public/, such as /og.svg and /robots.txt) and only
    // then from the function; the function alone answers 404 for those paths.
    if (req.method === "GET" || req.method === "HEAD") {
      const path = resolve(root, "." + decodeURIComponent(url.pathname));
      // A path outside the static root (a traversal, or "/" itself, which
      // resolves to the root directory) is never read as a file.
      const data = path.startsWith(root + sep) ? await readFile(path).catch(() => null) : null;
      if (data) {
        const suffix = path.slice(path.lastIndexOf("."));
        res.writeHead(200, { "content-type": mime[suffix] ?? "application/octet-stream" });
        res.end(req.method === "HEAD" ? undefined : data);
        return;
      }
      if (url.pathname.startsWith("/assets/")) {
        res.writeHead(404);
        res.end();
        return;
      }
    }
    const request = new Request(url, {
      method: req.method,
      headers: req.headers,
      ...(req.method !== "GET" && req.method !== "HEAD"
        ? { body: Readable.toWeb(req), duplex: "half" }
        : {}),
    });
    const response = await entry.default.fetch(request, {
      waitUntil(promise) {
        tasks.add(promise);
        void promise.catch(() => {}).finally(() => tasks.delete(promise));
      },
    });
    res.statusCode = response.status;
    for (const [key, value] of response.headers)
      if (key !== "set-cookie") res.setHeader(key, value);
    const cookies = response.headers.getSetCookie();
    if (cookies.length) res.setHeader("set-cookie", cookies);
    if (response.body && req.method !== "HEAD")
      await pipeline(Readable.fromWeb(response.body), res);
    else res.end();
  } catch (error) {
    console.error("[built-test] request failed", error);
    if (!res.headersSent) res.writeHead(500);
    res.end("Test server failed");
  }
});
server.listen(8080, "127.0.0.1", () =>
  console.log("[built-test] compiled Vercel handler listening at " + base),
);
async function stop() {
  server.closeAllConnections();
  server.close();
  await Promise.allSettled([...tasks]);
  process.exit(0);
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
