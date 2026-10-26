import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Connect, Plugin, UserConfigFn, ViteDevServer } from "vite";
import config from "../vite.config.js";

test("an explicit empty verification key disables live mode even with a dotenv credential", async () => {
  const root = await mkdtemp(join(tmpdir(), "jev-config-key-"));
  const cwd = process.cwd(),
    previous = process.env.TYPESAFE_API_KEY;
  try {
    await writeFile(
      join(root, ".env"),
      "TYPESAFE_API_KEY=dotenv-sentinel-not-a-credential\n",
    );
    process.chdir(root);
    for (const [key, expected] of [
      [undefined, true],
      ["", false],
      ["explicit-sentinel", true],
    ] as const) {
      if (key === undefined) delete process.env.TYPESAFE_API_KEY;
      else process.env.TYPESAFE_API_KEY = key;
      const resolved = await (config as UserConfigFn)({
        command: "serve",
        mode: "test",
      });
      const plugin = resolved.plugins
        ?.flat()
        .find(
          (p) =>
            p &&
            typeof p === "object" &&
            "name" in p &&
            p.name === "jev-inspector-server",
        ) as Plugin;
      assert.ok(plugin);
      const handlers: Connect.NextHandleFunction[] = [];
      const httpServer = new EventEmitter();
      const server = {
        httpServer,
        middlewares: {
          use(handler: Connect.NextHandleFunction) {
            handlers.push(handler);
          },
        },
      } as unknown as ViteDevServer;
      try {
        const hook = plugin.configureServer;
        assert.equal(typeof hook, "function");
        await (hook as (server: ViteDevServer) => unknown)(server);
        let status: number | undefined,
          body = "";
        const request = {
          method: "GET",
          url: "/__jev/config?session=00000000-0000-4000-8000-000000000000",
          headers: { host: "127.0.0.1:4182" },
        } as IncomingMessage;
        const response = {
          writeHead(code: number) {
            status = code;
            return this;
          },
          end(data: string) {
            body = data;
          },
        } as unknown as ServerResponse;
        await handlers.at(-1)!(request, response, () =>
          assert.fail("config route not handled"),
        );
        assert.equal(status, 200);
        assert.equal(JSON.parse(body).liveAvailable, expected);
      } finally {
        httpServer.emit("close");
      }
    }
  } finally {
    process.chdir(cwd);
    if (previous === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = previous;
    await rm(root, { recursive: true, force: true });
  }
});
