import { test } from "node:test";
import assert from "node:assert/strict";
import { APIError, TypeSafeClient, noul } from "@typesafe-ai/sdk";
import { defineJevFlow, type FlowObserver } from "../flow/index.js";

const flow = defineJevFlow("observer-request", (f) => {
  const response = f.jev("request", {
    state: "Independent observer fixture",
    questions: { ok: noul("Okay?") },
  });
  return f.output("done", response.answer("ok").noul);
});

test("observer failures cannot duplicate SDK calls or replace their result/error", async (t) => {
  const modes = [
    "none",
    "before",
    "after",
    "reject-before",
    "reject-after",
    "repeat",
    "defer",
    "swallow",
  ] as const;
  for (const outcome of [
    "success",
    "sdk-error",
    "sync-error",
    "cancel",
  ] as const) {
    for (const mode of modes) {
      await t.test(`${outcome}: ${mode}`, async () => {
        const controller = new AbortController();
        const observerError = new Error("Recording failed");
        const synchronousError = new Error("Synchronous client failure");
        let calls = 0;
        let attempts = 0;
        const pending: Promise<unknown>[] = [];
        class Client extends TypeSafeClient {
          override systemOne: TypeSafeClient["systemOne"] = (
            request,
            options,
          ) => {
            calls++;
            if (outcome === "sync-error") throw synchronousError;
            const result = super.systemOne(request, options);
            // Keep failed baseline observer cases from leaving abandoned SDK work.
            pending.push(Promise.resolve(result).catch(() => {}));
            return result;
          };
        }
        const client = new Client({
          apiKey: "sample-only",
          logLevel: "off",
          retry: { maxRetries: 0 },
          fetch: async () => {
            attempts++;
            if (outcome === "cancel") {
              controller.abort();
              throw controller.signal.reason;
            }
            return outcome === "sdk-error"
              ? Response.json(
                  { error: { message: "Actual SDK rejection" } },
                  { status: 400 },
                )
              : Response.json({
                  model: "fixture",
                  answers: { ok: { type: "noul", noul: 0.75 } },
                });
          },
        });
        const devtools: FlowObserver = {
          startFlow: () => ({
            update() {},
            request<T>(_link: unknown, _trace: unknown, callback: () => T): T {
              if (mode === "before") throw observerError;
              // A JavaScript extension may return a different promise than the SDK's.
              if (mode === "reject-before")
                return Promise.reject(observerError) as T;
              if (mode === "defer")
                return Promise.resolve().then(callback) as T;
              if (mode === "swallow") {
                return Promise.resolve()
                  .then(callback)
                  .catch(() => ({
                    answers: { ok: { type: "noul", noul: 0.25 } },
                  })) as T;
              }
              const result = callback();
              if (mode === "after") throw observerError;
              if (mode === "reject-after")
                return Promise.resolve(result).then(
                  () => {
                    throw observerError;
                  },
                  () => {
                    throw observerError;
                  },
                ) as T;
              if (mode === "repeat") return callback();
              return result;
            },
          }),
        };
        try {
          const run = flow.run(
            {},
            {
              client,
              devtools: mode === "none" ? undefined : devtools,
              signal: controller.signal,
            },
          );
          if (outcome === "success") assert.equal((await run).value, 0.75);
          else
            await assert.rejects(run, (error: unknown) => {
              if (outcome === "sync-error") return error === synchronousError;
              if (outcome === "cancel")
                return error instanceof Error && error.name === "AbortError";
              return (
                error instanceof APIError &&
                error.status === 400 &&
                error.message.includes("Actual SDK rejection")
              );
            });
          await Promise.all(pending);
          assert.equal(calls, 1);
          assert.equal(attempts, outcome === "sync-error" ? 0 : 1);
        } finally {
          controller.abort();
          await Promise.all(pending);
        }
      });
    }
  }
});

test("observer cancellation before dispatch cannot trigger a fallback request", async () => {
  const controller = new AbortController();
  let calls = 0;
  const client = {
    systemOne() {
      calls++;
      throw new Error("Must not dispatch");
    },
  };
  await assert.rejects(
    flow.run(
      {},
      {
        client,
        signal: controller.signal,
        devtools: {
          startFlow: () => ({
            update() {},
            request() {
              controller.abort();
              throw new Error("Observer failed after cancellation");
            },
          }),
        },
      },
    ),
    { name: "AbortError" },
  );
  assert.equal(calls, 0);
});
