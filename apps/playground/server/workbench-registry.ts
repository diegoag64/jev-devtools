import { confidenceFlow } from "../../../cookbooks/confidence-fallback/flow.js";
import { confidenceCases } from "../../../cookbooks/confidence-fallback/cases.js";
import { createSkillSuggestionFlow } from "../../../cookbooks/skill-suggestion/flow.js";
import { skillCases } from "../../../cookbooks/skill-suggestion/cases.js";
import { functionFlow } from "../../../cookbooks/function-calling/flow.js";
import { functionCases } from "../../../cookbooks/function-calling/cases.js";
import { guardrailsFlow } from "../../../cookbooks/guardrails/flow.js";
import { guardrailsCases } from "../../../cookbooks/guardrails/cases.js";
import { citationFlow } from "../../../cookbooks/citation-checking/flow.js";
import { citationCases } from "../../../cookbooks/citation-checking/cases.js";
import { ragFlow } from "../../../cookbooks/rag-passages/flow.js";
import { ragCases } from "../../../cookbooks/rag-passages/cases.js";
import { memoryFlow } from "../../../cookbooks/simple-memory/flow.js";
import { memoryCases } from "../../../cookbooks/simple-memory/cases.js";
import { hierarchyFlow } from "../../../cookbooks/hierarchical-classification/flow.js";
import { hierarchyCases } from "../../../cookbooks/hierarchical-classification/cases.js";
import { twitchFlow } from "../../../cookbooks/twitch-chat-filter/flow.js";
import { twitchCases } from "../../../cookbooks/twitch-chat-filter/cases.js";
import { sdeFlow } from "../../../cookbooks/sde-cascade/flow.js";
import { sdeCases } from "../../../cookbooks/sde-cascade/cases.js";
import { dateFlow } from "../../../cookbooks/date-extraction/flow.js";
import { dateCases } from "../../../cookbooks/date-extraction/cases.js";
import { extractionFlow } from "../../../cookbooks/pre-parsed-extraction/flow.js";
import { extractionCases } from "../../../cookbooks/pre-parsed-extraction/cases.js";
import { structureFlow } from "../../../cookbooks/structure-recovery/flow.js";
import { structureCases } from "../../../cookbooks/structure-recovery/cases.js";
import { rerankingFlow } from "../../../cookbooks/reranking/flow.js";
import { rerankingCases } from "../../../cookbooks/reranking/cases.js";
import { lineSearchFlow } from "../../../cookbooks/line-search/flow.js";
import { lineSearchCases } from "../../../cookbooks/line-search/cases.js";
import { entityFlow } from "../../../cookbooks/entity-alignment/flow.js";
import { entityCases } from "../../../cookbooks/entity-alignment/cases.js";
import { parallelQuestionsFlow } from "../../../cookbooks/parallel-questions/flow.js";
import { parallelQuestionsCases } from "../../../cookbooks/parallel-questions/cases.js";
import { consistencyFlow } from "../../../cookbooks/consistency-choices/flow.js";
import { consistencyCases } from "../../../cookbooks/consistency-choices/cases.js";
import { createNoulFlow } from "../../../cookbooks/consistency-nouls/flow.js";
import { noulCases } from "../../../cookbooks/consistency-nouls/cases.js";
import type { FlowDefinition } from "jev-devtools/flow";
export const workbenchRegistry: Record<
  string,
  {
    definition: FlowDefinition;
    scenario: string;
    caseField: string;
    samples: Record<string, { label: string; message: string }>;
  }
> = {
  "confidence-fallback": {
    definition: confidenceFlow.definition,
    scenario: "flow-confidence",
    caseField: "confidenceCase",
    samples: confidenceCases,
  },
  "skill-suggestion": {
    definition: createSkillSuggestionFlow().definition,
    scenario: "flow-skills",
    caseField: "cookbookCase",
    samples: skillCases,
  },
  "function-calling": {
    definition: functionFlow.definition,
    scenario: "flow-function-calling",
    caseField: "functionCase",
    samples: functionCases,
  },
  guardrails: {
    definition: guardrailsFlow.definition,
    scenario: "flow-guardrails",
    caseField: "guardrailsCase",
    samples: guardrailsCases,
  },
  "citation-checking": {
    definition: citationFlow.definition,
    scenario: "flow-citation",
    caseField: "citationCase",
    samples: citationCases,
  },
  "rag-passages": {
    definition: ragFlow.definition,
    scenario: "flow-rag",
    caseField: "ragCase",
    samples: ragCases,
  },
  "simple-memory": {
    definition: memoryFlow.definition,
    scenario: "flow-memory",
    caseField: "memoryCase",
    samples: memoryCases,
  },
  "hierarchical-classification": {
    definition: hierarchyFlow.definition,
    scenario: "flow-hierarchy",
    caseField: "hierarchyCase",
    samples: hierarchyCases,
  },
  "twitch-chat-filter": {
    definition: twitchFlow.definition,
    scenario: "flow-twitch",
    caseField: "twitchCase",
    samples: twitchCases,
  },
  "sde-cascade": {
    definition: sdeFlow.definition,
    scenario: "flow-sde",
    caseField: "sdeCase",
    samples: sdeCases,
  },
  "date-extraction": {
    definition: dateFlow.definition,
    scenario: "flow-date",
    caseField: "dateCase",
    samples: dateCases,
  },
  "pre-parsed-extraction": {
    definition: extractionFlow.definition,
    scenario: "flow-extraction",
    caseField: "extractionCase",
    samples: extractionCases,
  },
  "structure-recovery": {
    definition: structureFlow.definition,
    scenario: "flow-structure",
    caseField: "structureCase",
    samples: structureCases,
  },
  reranking: {
    definition: rerankingFlow.definition,
    scenario: "flow-reranking",
    caseField: "rerankingCase",
    samples: rerankingCases,
  },
  "line-search": {
    definition: lineSearchFlow.definition,
    scenario: "flow-line-search",
    caseField: "lineSearchCase",
    samples: lineSearchCases,
  },
  "entity-alignment": {
    definition: entityFlow.definition,
    scenario: "flow-entity",
    caseField: "entityCase",
    samples: entityCases,
  },
  "parallel-questions": {
    definition: parallelQuestionsFlow.definition,
    scenario: "flow-parallel-questions",
    caseField: "parallelQuestionsCase",
    samples: parallelQuestionsCases,
  },
  "consistency-choices": {
    definition: consistencyFlow.definition,
    scenario: "flow-consistency-choices",
    caseField: "consistencyCase",
    samples: consistencyCases,
  },
  "consistency-nouls": {
    definition: createNoulFlow().definition,
    scenario: "flow-nouls",
    caseField: "noulCase",
    samples: noulCases,
  },
};
