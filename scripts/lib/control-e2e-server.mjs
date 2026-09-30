/** Test-only compiled-handler server. No fixture endpoint or application auth bypass. */
import { createServer } from "node:http";
import { readFile, copyFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { resolve, sep, extname } from "node:path";
import { pathToFileURL } from "node:url";

export async function serveControlTestBuild() {
  if (
    process.env.PRECOG_CONTROL_E2E !== "1" ||
    process.env.DATABASE_URL?.trim() ||
    process.env.VERCEL_ENV === "production"
  )
    throw new Error(
      "Control browser tests require opt-in and a disposable embedded database, never a deployed database.",
    );
  // Production uses Postgres. Supply the embedded backend's runtime assets
  // only to this disposable test output; these are not new application dependencies.
  for (const file of ["pglite.data", "pglite.wasm", "initdb.wasm"]) {
    await copyFile(
      resolve("node_modules/@electric-sql/pglite/dist", file),
      resolve(".vercel/output/functions/__server.func/_libs", file),
    );
  }
  const entry = await import(
    pathToFileURL(resolve(".vercel/output/functions/__server.func/index.mjs")).href
  );
  const root = resolve(".vercel/output/static");
  const types = {
    ".js": "text/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
  };
  const tasks = new Set();
  const base = "http://localhost:8089";
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", base);
      if (url.pathname.startsWith("/assets/")) {
        const path = resolve(root, "." + decodeURIComponent(url.pathname));
        if (!path.startsWith(root + sep)) {
          res.writeHead(400).end();
          return;
        }
        try {
          const data = await readFile(path);
          res.writeHead(200, {
            "content-type": types[extname(path)] ?? "application/octet-stream",
          });
          res.end(req.method === "HEAD" ? undefined : data);
        } catch {
          res.writeHead(404).end();
        }
        return;
      }
      const request = new Request(url, {
        method: req.method,
        headers: req.headers,
        ...(!["GET", "HEAD"].includes(req.method)
          ? { body: Readable.toWeb(req), duplex: "half" }
          : {}),
      });
      const response = await entry.default.fetch(request, {
        waitUntil(p) {
          tasks.add(p);
          void p.catch(() => {}).finally(() => tasks.delete(p));
        },
      });
      res.statusCode = response.status;
      for (const [k, v] of response.headers) if (k !== "set-cookie") res.setHeader(k, v);
      const cookies = response.headers.getSetCookie();
      if (cookies.length) res.setHeader("set-cookie", cookies);
      if (response.body && req.method !== "HEAD")
        await pipeline(Readable.fromWeb(response.body), res);
      else res.end();
    } catch (error) {
      console.error("[control-e2e] request failed", error);
      if (!res.headersSent) res.writeHead(500);
      res.end("Test server failed");
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(8089, "127.0.0.1", resolve);
  });
  return {
    base,
    async stop() {
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
      await Promise.allSettled([...tasks]);
      const pg = await globalThis.__pgliteInstance__;
      if (pg) await pg.close();
    },
  };
}
