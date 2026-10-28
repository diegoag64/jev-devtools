import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer, request } from "node:http";
import { once } from "node:events";
import type { Connect, ViteDevServer } from "vite";
import { jevInspectorServer } from "../server/plugin.js";

test("playground and inspector use the configured port and reject other origins", async () => {
  const handlers: Connect.NextHandleFunction[] = [];
  const httpServer = createServer((req, res) => {
    let index = 0;
    const next = () => {
      const handler = handlers[index++];
      if (handler) handler(req, res, next);
      else res.writeHead(404).end();
    };
    next();
  });
  httpServer.listen(0, "127.0.0.1");
  await once(httpServer, "listening");
  const address = httpServer.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  const plugin = jevInspectorServer();
  const server = {
    config: { server: { port: address.port } },
    httpServer,
    middlewares: {
      use(handler: Connect.NextHandleFunction) {
        handlers.push(handler);
      },
    },
  } as unknown as ViteDevServer;
  const hook = plugin.configureServer as (server: ViteDevServer) => unknown;
  const session = "00000000-0000-4000-8000-000000000000";
  try {
    await hook(server);
    for (const path of [
      "/__jev/config",
      "/api/jev-devtools",
      "/__jev/cookbooks/confidence-fallback",
    ]) {
      const url = `${origin}${path}?session=${session}`;
      assert.equal((await fetch(url)).status, 200, path);
      const wrongHostStatus = await new Promise<number | undefined>(
        (resolve, reject) => {
          const req = request(
            url,
            { headers: { host: "127.0.0.1:4182" } },
            (res) => {
              res.resume();
              resolve(res.statusCode);
            },
          );
          req.on("error", reject);
          req.end();
        },
      );
      assert.equal(wrongHostStatus, 403, path);
      for (const headers of [
        { origin: "http://127.0.0.1:4182" },
        { origin, "sec-fetch-site": "cross-site" },
      ] as Record<string, string>[]) {
        assert.equal((await fetch(url, { headers })).status, 403, path);
      }
    }
    const url = `${origin}/__jev/run?session=${session}`;
    const body = JSON.stringify({
      scenario: "triage",
      mode: "sample",
      message: "I need a refund for my order.",
      runId: session,
    });
    for (const headers of [
      { "content-type": "application/json" },
      { "content-type": "application/json", origin: "http://127.0.0.1:4182" },
    ] as Record<string, string>[]) {
      assert.equal(
        (await fetch(url, { method: "POST", headers, body })).status,
        403,
      );
    }
    const result = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body,
    });
    assert.equal(result.status, 200, await result.text());
  } finally {
    httpServer.closeAllConnections();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }
});
