import { choice } from "@typesafe-ai/sdk";
import { defineJevFlow } from "jev-devtools/flow";
import {
  confidenceCases,
  isConfidenceCase,
  type ConfidenceCase,
} from "./cases.js";
import { describe, division, groupCriteria } from "./taxonomy.js";
export const CONFIDENT = 0.9;
export const QUESTION =
  "Which broad industry does this company operate in? Judge the company's own operations as this filing describes them.";
export function industryRequest(message: string) {
  return {
    model: "jev-1.12",
    state: message,
    questions: { group: choice(QUESTION, groupCriteria) },
  };
}
export type ConfidenceResult = {
  level: "group" | "division";
  label: string;
  group: string;
  groupDescription: string;
  confidence: number;
  probabilities: Record<string, number>;
  largestProbability: number;
};
export const confidenceFlow = defineJevFlow<{
  message: string;
  caseId: ConfidenceCase;
}>("Cookbook · Confidence fallback", (flow) => {
  const prepared = flow.task(
    "prepare-filing",
    {
      input: flow.input,
      run: ({ message, caseId }) => {
        if (
          !isConfidenceCase(caseId) ||
          message !== confidenceCases[caseId].message
        )
          throw new Error("No confidence sample matches this document");
        return message;
      },
    },
    {
      title: "Validate sample document",
      description:
        "Only the selected authored description can use its synthetic response. This is not a real SEC filing.",
    },
  );
  const assessment = flow.jev(
    "classify-industry",
    { input: prepared, request: industryRequest },
    {
      title: "Choose among 75 industry groups",
      description:
        "One Choice question using the original 444-code SEC taxonomy. API confidence and class probabilities are separate returned fields.",
    },
  );
  const answer = assessment.answer("group");
  const selected = flow.if(
    "confident-group",
    {
      when: answer.confidence.gte(CONFIDENT),
      then: (path) =>
        path.task(
          "report-group",
          {
            input: answer.choice,
            run: (group) => ({ level: "group" as const, label: group }),
          },
          {
            title: "Keep the industry group",
            description:
              "At 0.90 API confidence or above, report the selected two-digit group.",
          },
        ),
      else: (path) =>
        path.task(
          "lookup-parent-division",
          {
            input: answer.choice,
            run: (group) => ({
              level: "division" as const,
              label: division(group),
            }),
          },
          {
            title: "Look up the actual parent division",
            description:
              "Below 0.90, map the selected group through the original inclusive SIC division ranges. No second Jev request.",
          },
        ),
    },
    {
      title: "API confidence ≥ 0.90?",
      description:
        "Read the returned confidence field. Do not substitute the largest class probability or a Score.",
    },
  );
  const result = flow.task(
    "assemble-result",
    {
      input: {
        selected,
        group: answer.choice,
        confidence: answer.confidence,
        probabilities: answer.probabilities,
      },
      run: ({
        selected,
        group,
        confidence,
        probabilities,
      }): ConfidenceResult => ({
        ...selected,
        group,
        groupDescription: describe(group),
        confidence,
        probabilities,
        largestProbability: Math.max(...Object.values(probabilities)),
      }),
    },
    {
      title: "Attach classification evidence",
      description:
        "Retain the chosen group and complete probability distribution alongside the reported level and label. No model-quality calculation.",
    },
  );
  return flow.output("classification", result, {
    title: "Industry classification",
    description:
      "A specific group or its parent division, from one synthetic Choice response.",
  });
});
