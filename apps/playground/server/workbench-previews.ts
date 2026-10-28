import { createJevDevtools } from "jev-devtools/server";
import type { FlowDefinition, FlowRunOptions } from "jev-devtools/flow";
import type { Fetch } from "@typesafe-ai/sdk";
import type { CookbookPreview } from "../src/workbench/types.js";
import { workbenchRegistry } from "./workbench-registry.js";
import { confidenceFlow } from "../../../cookbooks/confidence-fallback/flow.js";
import { confidenceSampleTransport } from "../../../cookbooks/confidence-fallback/samples.js";
import { createSkillSuggestionFlow } from "../../../cookbooks/skill-suggestion/flow.js";
import { skillSampleTransport } from "../../../cookbooks/skill-suggestion/samples.js";
import { functionFlow } from "../../../cookbooks/function-calling/flow.js";
import { functionSampleTransport } from "../../../cookbooks/function-calling/samples.js";
import { guardrailsFlow } from "../../../cookbooks/guardrails/flow.js";
import { guardrailsSampleTransport } from "../../../cookbooks/guardrails/samples.js";
import { citationFlow } from "../../../cookbooks/citation-checking/flow.js";
import { citationSampleTransport } from "../../../cookbooks/citation-checking/samples.js";
import { ragFlow } from "../../../cookbooks/rag-passages/flow.js";
import { ragSampleTransport } from "../../../cookbooks/rag-passages/samples.js";
import { memoryFlow } from "../../../cookbooks/simple-memory/flow.js";
import { memorySampleTransport } from "../../../cookbooks/simple-memory/samples.js";
import {
  hierarchyFlow,
  hierarchyLimitFlow,
} from "../../../cookbooks/hierarchical-classification/flow.js";
import { hierarchySampleTransport } from "../../../cookbooks/hierarchical-classification/samples.js";
import { twitchFlow } from "../../../cookbooks/twitch-chat-filter/flow.js";
import { twitchSampleTransport } from "../../../cookbooks/twitch-chat-filter/samples.js";
import { sdeFlow } from "../../../cookbooks/sde-cascade/flow.js";
import { sdeSampleTransport } from "../../../cookbooks/sde-cascade/samples.js";
import { dateFlow } from "../../../cookbooks/date-extraction/flow.js";
import { dateSampleTransport } from "../../../cookbooks/date-extraction/samples.js";
import { extractionFlow } from "../../../cookbooks/pre-parsed-extraction/flow.js";
import { extractionSampleTransport } from "../../../cookbooks/pre-parsed-extraction/samples.js";
import { structureFlow } from "../../../cookbooks/structure-recovery/flow.js";
import { structureSampleTransport } from "../../../cookbooks/structure-recovery/samples.js";
import { rerankingFlow } from "../../../cookbooks/reranking/flow.js";
import { rerankingSampleTransport } from "../../../cookbooks/reranking/samples.js";
import { lineSearchFlow } from "../../../cookbooks/line-search/flow.js";
import { lineSearchSampleTransport } from "../../../cookbooks/line-search/samples.js";
import { entityFlow } from "../../../cookbooks/entity-alignment/flow.js";
import { entitySampleTransport } from "../../../cookbooks/entity-alignment/samples.js";
import { parallelQuestionsFlow } from "../../../cookbooks/parallel-questions/flow.js";
import { parallelQuestionsSampleTransport } from "../../../cookbooks/parallel-questions/samples.js";
import { consistencyFlow } from "../../../cookbooks/consistency-choices/flow.js";
import { consistencySampleTransport } from "../../../cookbooks/consistency-choices/samples.js";
import { createNoulFlow } from "../../../cookbooks/consistency-nouls/flow.js";
import { createNoulSample } from "../../../cookbooks/consistency-nouls/samples.js";

// A private recorder keeps previews out of the user's drawer history. The normal
// capture boundary still supplies redaction, limits, metadata, and nested runs.
async function capture<T>(
  flow: {
    definition: FlowDefinition;
    run(
      input: T,
      options: FlowRunOptions,
    ): Promise<{ runId: string; outcome: string; value?: unknown }>;
  },
  input: T,
  fetch: Fetch,
  sampleId: string,
): Promise<CookbookPreview> {
  const origin = "http://127.0.0.1";
  const inspector = createJevDevtools({ enabled: true, origin, limit: 200 });
  const client = inspector.createClient(
    { apiKey: "sample-only", fetch, logLevel: "off", retry: { maxRetries: 0 } },
    { source: "sample", label: flow.definition.name },
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
      await flow.run(input, { client, devtools: inspector });
    } catch (error) {
      failure = error;
    }
    const [requests, flows] = await Promise.all([
      snapshot("/events"),
      snapshot("/flows/events"),
    ]);
    const run = flows.upserts.find(
      (item: { definitionId: string }) =>
        item.definitionId === flow.definition.id,
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
const previews: Record<
  string,
  (id: string, message: string) => Promise<CookbookPreview>
> = {
  "confidence-fallback": (id, message) =>
    capture(
      confidenceFlow,
      {
        caseId: id as Parameters<typeof confidenceSampleTransport>[0],
        message,
      },
      confidenceSampleTransport(
        id as Parameters<typeof confidenceSampleTransport>[0],
        0,
      ),
      id,
    ),
  "skill-suggestion": (id, message) =>
    capture(
      createSkillSuggestionFlow(),
      { message },
      skillSampleTransport(id as Parameters<typeof skillSampleTransport>[0], 0),
      id,
    ),
  "function-calling": (id, message) =>
    capture(
      functionFlow,
      { caseId: id as Parameters<typeof functionSampleTransport>[0], message },
      functionSampleTransport(
        id as Parameters<typeof functionSampleTransport>[0],
        0,
      ),
      id,
    ),
  guardrails: (id, message) =>
    capture(
      guardrailsFlow,
      {
        caseId: id as Parameters<typeof guardrailsSampleTransport>[0],
        message,
      },
      guardrailsSampleTransport(
        id as Parameters<typeof guardrailsSampleTransport>[0],
        0,
      ),
      id,
    ),
  "citation-checking": (id, message) =>
    capture(
      citationFlow,
      { caseId: id as Parameters<typeof citationSampleTransport>[0], message },
      citationSampleTransport(
        id as Parameters<typeof citationSampleTransport>[0],
        0,
      ),
      id,
    ),
  "rag-passages": (id, message) =>
    capture(
      ragFlow,
      { caseId: id as Parameters<typeof ragSampleTransport>[0], message },
      ragSampleTransport(id as Parameters<typeof ragSampleTransport>[0], 0),
      id,
    ),
  "simple-memory": (id, message) =>
    capture(
      memoryFlow,
      { caseId: id as Parameters<typeof memorySampleTransport>[0], message },
      memorySampleTransport(
        id as Parameters<typeof memorySampleTransport>[0],
        0,
      ),
      id,
    ),
  "hierarchical-classification": (id, message) =>
    capture(
      id === "limit" ? hierarchyLimitFlow : hierarchyFlow,
      { caseId: id as Parameters<typeof hierarchySampleTransport>[0], message },
      hierarchySampleTransport(
        id as Parameters<typeof hierarchySampleTransport>[0],
        0,
      ),
      id,
    ),
  "twitch-chat-filter": (id, message) =>
    capture(
      twitchFlow,
      { caseId: id as Parameters<typeof twitchSampleTransport>[0], message },
      twitchSampleTransport(
        id as Parameters<typeof twitchSampleTransport>[0],
        0,
      ),
      id,
    ),
  "sde-cascade": (id, message) =>
    capture(
      sdeFlow,
      { caseId: id as Parameters<typeof sdeSampleTransport>[0], message },
      sdeSampleTransport(id as Parameters<typeof sdeSampleTransport>[0], 0),
      id,
    ),
  "date-extraction": (id, message) =>
    capture(
      dateFlow,
      { caseId: id as Parameters<typeof dateSampleTransport>[0], message },
      dateSampleTransport(id as Parameters<typeof dateSampleTransport>[0], 0),
      id,
    ),
  "pre-parsed-extraction": (id, message) =>
    capture(
      extractionFlow,
      {
        caseId: id as Parameters<typeof extractionSampleTransport>[0],
        message,
      },
      extractionSampleTransport(
        id as Parameters<typeof extractionSampleTransport>[0],
        0,
      ),
      id,
    ),
  "structure-recovery": (id, message) =>
    capture(
      structureFlow,
      { caseId: id as Parameters<typeof structureSampleTransport>[0], message },
      structureSampleTransport(
        id as Parameters<typeof structureSampleTransport>[0],
        0,
      ),
      id,
    ),
  reranking: (id, message) =>
    capture(
      rerankingFlow,
      { caseId: id as Parameters<typeof rerankingSampleTransport>[0], message },
      rerankingSampleTransport(
        id as Parameters<typeof rerankingSampleTransport>[0],
        0,
      ),
      id,
    ),
  "line-search": (id, message) =>
    capture(
      lineSearchFlow,
      {
        caseId: id as Parameters<typeof lineSearchSampleTransport>[0],
        message,
      },
      lineSearchSampleTransport(
        id as Parameters<typeof lineSearchSampleTransport>[0],
        0,
      ),
      id,
    ),
  "entity-alignment": (id, message) =>
    capture(
      entityFlow,
      { caseId: id as Parameters<typeof entitySampleTransport>[0], message },
      entitySampleTransport(
        id as Parameters<typeof entitySampleTransport>[0],
        0,
      ),
      id,
    ),
  "parallel-questions": (id, message) =>
    capture(
      parallelQuestionsFlow,
      {
        caseId: id as Parameters<typeof parallelQuestionsSampleTransport>[0],
        message,
      },
      parallelQuestionsSampleTransport(
        id as Parameters<typeof parallelQuestionsSampleTransport>[0],
        0,
      ),
      id,
    ),
  "consistency-choices": (id, message) =>
    capture(
      consistencyFlow,
      {
        caseId: id as Parameters<typeof consistencySampleTransport>[0],
        message,
      },
      consistencySampleTransport(
        id as Parameters<typeof consistencySampleTransport>[0],
        0,
      ),
      id,
    ),
  "consistency-nouls": (id, message) => {
    const sample = createNoulSample(
      id as Parameters<typeof createNoulSample>[0],
      0,
    );
    return capture(
      createNoulFlow(sample.returnedModels),
      { caseId: id as Parameters<typeof createNoulSample>[0], message },
      sample.fetch,
      id,
    );
  },
};
// Cache only a small, known set of synthetic captures, never user inputs or live responses.
const cache = new Map<string, Promise<CookbookPreview>>();
export function readSamplePreview(slug: string, sampleId: string) {
  if (!Object.hasOwn(workbenchRegistry, slug)) return undefined;
  const recipe = workbenchRegistry[slug];
  if (
    !recipe ||
    !Object.hasOwn(recipe.samples, sampleId) ||
    !Object.hasOwn(previews, slug)
  )
    return undefined;
  const key = `${slug}:${sampleId}`;
  const existing = cache.get(key);
  if (existing) {
    cache.delete(key);
    cache.set(key, existing);
    return existing;
  }
  const pending = previews[slug](sampleId, recipe.samples[sampleId].message);
  cache.set(key, pending);
  if (cache.size > 8) cache.delete(cache.keys().next().value!);
  void pending.catch(() => {
    if (cache.get(key) === pending) cache.delete(key);
  });
  return pending;
}
