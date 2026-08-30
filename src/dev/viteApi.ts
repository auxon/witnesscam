import type { Plugin } from "vite";
import { handleBilling } from "../worker/stripe";
import { handleOrg } from "../worker/org";
import { handleTimestamp } from "../worker/timestamp";

function memoryKv() {
  const map = new Map<string, string>();
  return {
    get: async (key: string) => map.get(key) ?? null,
    put: async (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

/** Local Vite /api so seal + org work without wrangler. */
export function witnesscamDevApi(): Plugin {
  const env = { LICENSES: memoryKv() };
  return {
    name: "witnesscam-dev-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void (async () => {
          const host = req.headers.host || "localhost";
          const url = new URL(req.url || "/", `http://${host}`);
          let pathname = url.pathname;
          if (pathname.startsWith("/witnesscam")) {
            pathname = pathname.slice("/witnesscam".length) || "/";
          }
          if (!pathname.startsWith("/api/")) {
            next();
            return;
          }
          const chunks: Uint8Array[] = [];
          for await (const chunk of req) {
            chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
          }
          const buf = Buffer.concat(chunks);
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (typeof value === "string") headers.set(key, value);
            else if (Array.isArray(value)) headers.set(key, value.join(","));
          }
          const method = req.method || "GET";
          const request = new Request(url, {
            method,
            headers,
            body: method === "GET" || method === "HEAD" ? undefined : buf,
          });
          const response =
            (await handleTimestamp(request, pathname)) ||
            (await handleOrg(request, env, pathname)) ||
            (await handleBilling(request, env, pathname));
          if (!response) {
            next();
            return;
          }
          res.statusCode = response.status;
          response.headers.forEach((value, key) => {
            res.setHeader(key, value);
          });
          res.end(Buffer.from(await response.arrayBuffer()));
        })().catch(next);
      });
    },
  };
}
