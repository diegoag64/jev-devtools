import {
  createJevDevtools,
  type CaptureContext,
  type CaptureOptions,
} from "jev-devtools/server";
import { defineJevFlow } from "jev-devtools/flow";

const legacy: CaptureOptions = {
  redact: (path, value) => (path.at(-1) === "email" ? "hidden" : value),
};
const context: CaptureContext = { kind: "request" };
// @ts-expect-error The capture kind is readonly.
context.kind = "response";
// @ts-expect-error Only documented capture boundaries are valid kinds.
const invalid: CaptureContext = { kind: "task" };
void legacy;
void invalid;

export async function contextExample() {
  const kinds: CaptureContext["kind"][] = [];
  const adapter = createJevDevtools({
    origin: "http://localhost:5196",
    enabled: true,
    redact: (path, value, context) => {
      kinds.push(context.kind);
      return context.kind === "outcome" && path[0] === "state"
        ? "outcome-only"
        : value;
    },
  });
  try {
    const flow = defineJevFlow("typed-context", (f) => {
      const task = f.task("work", { input: "original", run: (value) => value });
      return f.output("done", { state: task });
    });
    const result = await flow.run(
      {},
      {
        client: {
          systemOne() {
            throw new Error("Unexpected inference");
          },
        },
        devtools: adapter,
      },
    );
    const response = await adapter.handle(
      new Request("http://localhost:5196/api/jev-devtools/flows/events"),
    );
    const reader = response.body!.getReader();
    try {
      const stored = JSON.parse(
        new TextDecoder()
          .decode((await reader.read()).value)
          .split("data: ")[1],
      );
      return { kinds, result, run: stored.upserts[0] };
    } finally {
      await reader.cancel();
    }
  } finally {
    adapter.dispose();
  }
}
