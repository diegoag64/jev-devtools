import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type RequestListener } from "node:http";
import { once } from "node:events";
import { postPlayground, RunError } from "../src/playground-request.js";

async function serverFor(handler: RequestListener) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing HTTP address");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

test("playground deadline releases requests stalled before headers or during the JSON body", async () => {
  const server = await serverFor((req, res) => {
    if (req.url === "/body") {
      res.writeHead(200, { "content-type": "application/json" });
      res.write('{"flow":');
    }
    // Deliberately never end either response.
  });
  try {
    for (const path of ["/headers", "/body"]) {
      let deadline: ReturnType<typeof setTimeout>;
      const watchdog = new Promise<Error>((resolve) => {
        deadline = setTimeout(
          () =>
            resolve(new Error("Request is still waiting after its deadline")),
          1000,
        );
      });
      const error = await Promise.race([
        postPlayground(server.url + path, {}, { timeoutMs: 100 }).catch(
          (error) => error,
        ),
        watchdog,
      ]);
      clearTimeout(deadline!);
      assert.ok(error instanceof RunError && error.timedOut, String(error));
      assert.equal(error.cancelled, false);
    }
  } finally {
    await server.close();
  }
});

test("playground transport preserves results and server cancellation, and aborts a pending call on user cancellation", async () => {
  let started!: () => void;
  const received = new Promise<void>((resolve) => {
    started = resolve;
  });
  const server = await serverFor((req, res) => {
    if (req.url === "/stall") {
      started();
      return;
    }
    res.writeHead(req.url === "/cancelled" ? 502 : 200, {
      "content-type": "application/json",
    });
    res.end(
      JSON.stringify(
        req.url === "/cancelled"
          ? { error: "AbortError", cancelled: true }
          : { flow: { outcome: "recovered-document" } },
      ),
    );
  });
  try {
    assert.deepEqual(await postPlayground(server.url), {
      flow: { outcome: "recovered-document" },
    });
    await assert.rejects(
      postPlayground(server.url + "/cancelled"),
      (error) =>
        error instanceof RunError && error.cancelled && !error.timedOut,
    );
    const controller = new AbortController();
    const result = postPlayground(
      server.url + "/stall",
      {},
      { signal: controller.signal },
    );
    const rejection = assert.rejects(
      result,
      (error) =>
        error instanceof RunError && error.cancelled && !error.timedOut,
    );
    await received;
    controller.abort();
    await rejection;
    // A cancelled request does not poison the next run.
    assert.equal(
      (await postPlayground(server.url)).flow.outcome,
      "recovered-document",
    );
  } finally {
    await server.close();
  }
});
