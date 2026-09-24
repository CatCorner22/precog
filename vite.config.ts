import type { Plugin } from "vite";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { productionConfigurationErrors } from "./src/lib/runtime-config";

function pgliteBootstrapPlugin(): Plugin {
  return {
    name: "app-builder:pglite-bootstrap",
    apply: "serve",
    async configureServer(server) {
      try {
        const mod = (await server.ssrLoadModule("/src/lib/db.ts")) as {
          ensureDbReady?: () => Promise<void>;
        };
        if (typeof mod.ensureDbReady === "function") await mod.ensureDbReady();
      } catch (error) {
        console.error("[app-builder] DB bootstrap failed:", error);
        throw error;
      }
    },
  };
}

/** Preserve the existing live-preview popup route and provider federation. */
function authPopupPlugin(): Plugin {
  return {
    name: "app-builder:auth-popup",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          const rawUrl = req.url ?? "";
          if (rawUrl.split("?", 1)[0] !== "/auth/popup") {
            next();
            return;
          }
          if ((req.method ?? "GET").toUpperCase() !== "GET") {
            res.statusCode = 405;
            res.setHeader("content-type", "text/plain; charset=utf-8");
            res.end("Method Not Allowed");
            return;
          }
          const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost:8080");
          const proto = String(
            req.headers["x-forwarded-proto"] ??
              ((req.socket as { encrypted?: boolean } | undefined)?.encrypted ? "https" : "http"),
          );
          const requestHeaders = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (value === undefined) continue;
            if (Array.isArray(value)) {
              for (const entry of value) requestHeaders.append(key, entry);
            } else {
              requestHeaders.set(key, value);
            }
          }
          if (!requestHeaders.has("host")) requestHeaders.set("host", host);
          const request = new Request(`${proto}://${host}${rawUrl}`, { method: "GET", headers: requestHeaders });
          const mod = (await server.ssrLoadModule("/src/lib/auth/popup.server.ts")) as {
            handleAuthPopupRequest: (request: Request) => Promise<Response>;
          };
          const response = await mod.handleAuthPopupRequest(request);
          res.statusCode = response.status;
          const setCookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
          response.headers.forEach((value, key) => {
            if (key.toLowerCase() !== "set-cookie") res.setHeader(key, value);
          });
          for (const cookie of setCookies) res.appendHeader("set-cookie", cookie);
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (error) {
          console.error("[app-builder] /auth/popup handler failed:", error);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader("content-type", "text/plain; charset=utf-8");
            res.end("auth popup failed");
          }
        }
      });
    },
  };
}

/** Node output is an isolated test adapter, never an implicit production target change. */
export default defineConfig(({ command }) => {
  if (command === "build") {
    const errors = productionConfigurationErrors(process.env);
    if (errors.length) throw new Error(`Refusing production build: ${errors.join("; ")}`);
    if (process.env.PRECOG_BUILD_TARGET && !["vercel", "node-server"].includes(process.env.PRECOG_BUILD_TARGET)) {
      throw new Error("PRECOG_BUILD_TARGET must be vercel or node-server");
    }
  }
  return {
    server: { host: "0.0.0.0", port: 8080, strictPort: true },
    resolve: { tsconfigPaths: true },
    optimizeDeps: {
      include: [
        "@better-auth/core/env",
        "@better-auth/core/error",
        "@better-auth/core/utils/error-codes",
        "@better-auth/core/utils/string",
        "@better-auth/core/utils/url",
        "@better-fetch/fetch",
        "@tanstack/router-core",
        "@tanstack/router-core/isServer",
        "@tanstack/router-core/ssr/client",
        "defu",
        "nanostores",
        "seroval",
      ],
    },
    plugins: [
      pgliteBootstrapPlugin(),
      authPopupPlugin(),
      tailwindcss(),
      tanstackStart(),
      ...(command === "build"
        ? [nitro({
            preset: process.env.PRECOG_BUILD_TARGET === "node-server" ? "node-server" : "vercel",
            routeRules: {
              "/**": {
                headers: {
                  "content-security-policy": "frame-ancestors 'self'",
                  "referrer-policy": "strict-origin-when-cross-origin",
                  "x-content-type-options": "nosniff",
                  "permissions-policy": "camera=(), microphone=(), geolocation=()",
                  "strict-transport-security": "max-age=31536000; includeSubDomains",
                },
              },
            },
          })]
        : []),
      viteReact(),
    ],
  };
});
