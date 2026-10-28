import type { FlowDefinition, FlowRunOptions } from "jev-devtools/flow";
import type { Fetch } from "@typesafe-ai/sdk";
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

export type CookbookSample = {
  definition: FlowDefinition;
  fetch: Fetch;
  run(
    options: FlowRunOptions,
  ): Promise<{ runId: string; outcome: string; value?: unknown }>;
};

function createSample<T>(
  flow: {
    definition: FlowDefinition;
    run(input: T, options: FlowRunOptions): ReturnType<CookbookSample["run"]>;
  },
  input: T,
  fetch: Fetch,
): CookbookSample {
  return {
    definition: flow.definition,
    fetch,
    run: (options) => flow.run(input, options),
  };
}
const samples: Record<
  string,
  (id: string, message: string, delay?: number) => CookbookSample
> = {
  "confidence-fallback": (id, message, delay) =>
    createSample(
      confidenceFlow,
      {
        caseId: id as Parameters<typeof confidenceSampleTransport>[0],
        message,
      },
      confidenceSampleTransport(
        id as Parameters<typeof confidenceSampleTransport>[0],
        delay,
      ),
    ),
  "skill-suggestion": (id, message, delay) =>
    createSample(
      createSkillSuggestionFlow(),
      { message },
      skillSampleTransport(
        id as Parameters<typeof skillSampleTransport>[0],
        delay,
      ),
    ),
  "function-calling": (id, message, delay) =>
    createSample(
      functionFlow,
      { caseId: id as Parameters<typeof functionSampleTransport>[0], message },
      functionSampleTransport(
        id as Parameters<typeof functionSampleTransport>[0],
        delay,
      ),
    ),
  guardrails: (id, message, delay) =>
    createSample(
      guardrailsFlow,
      {
        caseId: id as Parameters<typeof guardrailsSampleTransport>[0],
        message,
      },
      guardrailsSampleTransport(
        id as Parameters<typeof guardrailsSampleTransport>[0],
        delay,
      ),
    ),
  "citation-checking": (id, message, delay) =>
    createSample(
      citationFlow,
      { caseId: id as Parameters<typeof citationSampleTransport>[0], message },
      citationSampleTransport(
        id as Parameters<typeof citationSampleTransport>[0],
        delay,
      ),
    ),
  "rag-passages": (id, message, delay) =>
    createSample(
      ragFlow,
      { caseId: id as Parameters<typeof ragSampleTransport>[0], message },
      ragSampleTransport(id as Parameters<typeof ragSampleTransport>[0], delay),
    ),
  "simple-memory": (id, message, delay) =>
    createSample(
      memoryFlow,
      { caseId: id as Parameters<typeof memorySampleTransport>[0], message },
      memorySampleTransport(
        id as Parameters<typeof memorySampleTransport>[0],
        delay,
      ),
    ),
  "hierarchical-classification": (id, message, delay) =>
    createSample(
      id === "limit" ? hierarchyLimitFlow : hierarchyFlow,
      { caseId: id as Parameters<typeof hierarchySampleTransport>[0], message },
      hierarchySampleTransport(
        id as Parameters<typeof hierarchySampleTransport>[0],
        delay,
      ),
    ),
  "twitch-chat-filter": (id, message, delay) =>
    createSample(
      twitchFlow,
      { caseId: id as Parameters<typeof twitchSampleTransport>[0], message },
      twitchSampleTransport(
        id as Parameters<typeof twitchSampleTransport>[0],
        delay,
      ),
    ),
  "sde-cascade": (id, message, delay) =>
    createSample(
      sdeFlow,
      { caseId: id as Parameters<typeof sdeSampleTransport>[0], message },
      sdeSampleTransport(id as Parameters<typeof sdeSampleTransport>[0], delay),
    ),
  "date-extraction": (id, message, delay) =>
    createSample(
      dateFlow,
      { caseId: id as Parameters<typeof dateSampleTransport>[0], message },
      dateSampleTransport(
        id as Parameters<typeof dateSampleTransport>[0],
        delay,
      ),
    ),
  "pre-parsed-extraction": (id, message, delay) =>
    createSample(
      extractionFlow,
      {
        caseId: id as Parameters<typeof extractionSampleTransport>[0],
        message,
      },
      extractionSampleTransport(
        id as Parameters<typeof extractionSampleTransport>[0],
        delay,
      ),
    ),
  "structure-recovery": (id, message, delay) =>
    createSample(
      structureFlow,
      { caseId: id as Parameters<typeof structureSampleTransport>[0], message },
      structureSampleTransport(
        id as Parameters<typeof structureSampleTransport>[0],
        delay,
      ),
    ),
  reranking: (id, message, delay) =>
    createSample(
      rerankingFlow,
      { caseId: id as Parameters<typeof rerankingSampleTransport>[0], message },
      rerankingSampleTransport(
        id as Parameters<typeof rerankingSampleTransport>[0],
        delay,
      ),
    ),
  "line-search": (id, message, delay) =>
    createSample(
      lineSearchFlow,
      {
        caseId: id as Parameters<typeof lineSearchSampleTransport>[0],
        message,
      },
      lineSearchSampleTransport(
        id as Parameters<typeof lineSearchSampleTransport>[0],
        delay,
      ),
    ),
  "entity-alignment": (id, message, delay) =>
    createSample(
      entityFlow,
      { caseId: id as Parameters<typeof entitySampleTransport>[0], message },
      entitySampleTransport(
        id as Parameters<typeof entitySampleTransport>[0],
        delay,
      ),
    ),
  "parallel-questions": (id, message, delay) =>
    createSample(
      parallelQuestionsFlow,
      {
        caseId: id as Parameters<typeof parallelQuestionsSampleTransport>[0],
        message,
      },
      parallelQuestionsSampleTransport(
        id as Parameters<typeof parallelQuestionsSampleTransport>[0],
        delay,
      ),
    ),
  "consistency-choices": (id, message, delay) =>
    createSample(
      consistencyFlow,
      {
        caseId: id as Parameters<typeof consistencySampleTransport>[0],
        message,
      },
      consistencySampleTransport(
        id as Parameters<typeof consistencySampleTransport>[0],
        delay,
      ),
    ),
  "consistency-nouls": (id, message, delay) => {
    const sample = createNoulSample(
      id as Parameters<typeof createNoulSample>[0],
      delay,
    );
    return createSample(
      createNoulFlow(sample.returnedModels),
      { caseId: id as Parameters<typeof createNoulSample>[0], message },
      sample.fetch,
    );
  },
};
export function getCookbookSample(
  slug: string,
  sampleId: string,
  delay?: number,
) {
  if (!Object.hasOwn(workbenchRegistry, slug) || !Object.hasOwn(samples, slug))
    return undefined;
  const recipe = workbenchRegistry[slug];
  if (!Object.hasOwn(recipe.samples, sampleId)) return undefined;
  return samples[slug](sampleId, recipe.samples[sampleId].message, delay);
}
