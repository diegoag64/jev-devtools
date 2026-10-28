import { createJevDevtools } from "jev-devtools/server";
import type { CookbookPreview } from "../src/workbench/types.js";
import { getCookbookSample, type CookbookSample } from "./workbench-samples.js";

// Previews use a private recorder and skip artificial transport delays.
// Runs use the same sample definition with their visible recorder and cancellation signal.
async function capture(
  sample: CookbookSample,
  sampleId: string,
): Promise<CookbookPreview> {
  const origin = "http://127.0.0.1";
  const inspector = createJevDevtools({ enabled: true, origin, limit: 200 });
  const client = inspector.createClient(
    {
      apiKey: "sample-only",
      fetch: sample.fetch,
      logLevel: "off",
      retry: { maxRetries: 0 },
    },
    { source: "sample", label: sample.definition.name },
  );
  async function snapshot(path: string) {
    const response = await inspector.handle(
      new Request(origin + "/api/jev-devtools" + path),
    );
    const reader = response.body!.getReader();
    try {
      const { value } = await reader.read();
      const data = new TextDecoder()
        .decode(value)
        .split("\n")
        .find((line) => line.startsWith("data: "));
      if (!data) throw new Error("Sample capture did not produce a snapshot");
      return JSON.parse(data.slice(6));
    } finally {
      await reader.cancel();
    }
  }
  try {
    let failure: unknown;
    try {
      await sample.run({ client, devtools: inspector });
    } catch (error) {
      failure = error;
    }
    const [requests, flows] = await Promise.all([
      snapshot("/events"),
      snapshot("/flows/events"),
    ]);
    const run = flows.upserts.find(
      (item: { definitionId: string }) =>
        item.definitionId === sample.definition.id,
    );
    const definition = flows.definitions.find(
      (item: { id: string }) => item.id === run?.definitionId,
    );
    if (!run || !definition)
      throw failure ?? new Error("Sample flow capture is unavailable");
    return { sampleId, definition, run, traces: requests.traces };
  } finally {
    inspector.dispose();
  }
}
// Cache only a small, known set of synthetic captures, never user inputs or live responses.
const cache = new Map<string, Promise<CookbookPreview>>();
export function readSamplePreview(slug: string, sampleId: string) {
  const sample = getCookbookSample(slug, sampleId, 0);
  if (!sample) return undefined;
  const key = `${slug}:${sampleId}`;
  const existing = cache.get(key);
  if (existing) {
    cache.delete(key);
    cache.set(key, existing);
    return existing;
  }
  const pending = capture(sample, sampleId);
  cache.set(key, pending);
  if (cache.size > 8) cache.delete(cache.keys().next().value!);
  void pending.catch(() => {
    if (cache.get(key) === pending) cache.delete(key);
  });
  return pending;
}
