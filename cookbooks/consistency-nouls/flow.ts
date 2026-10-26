import { readFileSync } from "node:fs";
import { noul } from "@typesafe-ai/sdk";
import { defineJevFlow } from "jev-devtools/flow";
import { isNoulCase, noulCases, type NoulCase } from "./cases.js";

export const claim = JSON.parse(
  readFileSync(new URL("./claim.json", import.meta.url), "utf8"),
);
export const questionTexts: Record<string, string> = JSON.parse(
  readFileSync(new URL("./questions.json", import.meta.url), "utf8"),
);
export const requestedModel = "jev-latest";
export const repeatCount = 15;
export const flowName = "Cookbook · Noul self-consistency";
export type Decision = "no" | "uncertain" | "yes";
export type Answer = { key: string; probability: number; decision: Decision };
export type Repeat = {
  index: number;
  uid: string;
  requestedModel: string;
  returnedModel: string | null;
  answers: Answer[];
  review: string[];
};
export type NoulResult = {
  repeats: Repeat[];
  questions: {
    key: string;
    text: string;
    mean: number;
    min: number;
    max: number;
    populationStdDev: number;
    counts: Record<Decision, number>;
  }[];
  meanPopulationStdDev: number;
};
export function rubricRequest(uid: string) {
  return {
    model: requestedModel,
    state: { uid, claim },
    questions: Object.fromEntries(
      Object.entries(questionTexts).map(([key, text]) => [key, noul(text)]),
    ),
  };
}
function decision(probability: number): Decision {
  if (!Number.isFinite(probability) || probability < 0 || probability > 1)
    throw new Error("Invalid Noul probability");
  return probability < 0.3 ? "no" : probability > 0.7 ? "yes" : "uncertain";
}
function summarize(repeats: Repeat[]): NoulResult {
  const questions = Object.entries(questionTexts).map(([key, text]) => {
    const values = repeats.map(
      (repeat) => repeat.answers.find((answer) => answer.key === key)!,
    );
    const mean =
      values.reduce((sum, value) => sum + value.probability, 0) / values.length;
    const counts: Record<Decision, number> = { no: 0, uncertain: 0, yes: 0 };
    for (const value of values) counts[value.decision]++;
    return {
      key,
      text,
      mean,
      min: Math.min(...values.map((v) => v.probability)),
      max: Math.max(...values.map((v) => v.probability)),
      populationStdDev: Math.sqrt(
        values.reduce(
          (sum, value) => sum + (value.probability - mean) ** 2,
          0,
        ) / values.length,
      ),
      counts,
    };
  });
  return {
    repeats,
    questions,
    meanPopulationStdDev:
      questions.reduce((sum, q) => sum + q.populationStdDev, 0) /
      questions.length,
  };
}
/** The public Jev reference exposes answers only. A per-run transport sidecar
 * preserves actual response.model metadata; missing metadata stays null. */
export function createNoulFlow(
  returnedModels: ReadonlyMap<string, string> = new Map(),
) {
  return defineJevFlow<{ caseId: NoulCase; message: string }>(
    flowName,
    (flow) => {
      const prepared = flow.task(
        "prepare-repeats",
        {
          input: flow.input,
          run: ({ caseId, message }) => {
            if (!isNoulCase(caseId) || message !== noulCases[caseId].message)
              throw new Error("No Noul sample matches this input");
            return Array.from({ length: repeatCount }, (_, index) => ({
              index,
              uid: `${index}:synthetic-${caseId}`,
            }));
          },
        },
        {
          title: "Prepare 15 synthetic repeats",
          description:
            "Same official claim and rubric; deterministic UIDs vary by repeat. These are fixture requests, not independent model draws.",
        },
      );
      const repeats = flow.map(
        "repeat-rubric",
        { items: prepared, input: {}, concurrency: 1, maxItems: repeatCount },
        (item) => {
          const response = item.jev(
            "ask-rubric",
            {
              input: item.input.get("item").get("uid"),
              request: rubricRequest,
            },
            {
              title: "Ask all 14 Noul questions",
              description:
                "One sequential SDK request per repeat, requested model jev-latest. Noul is P(true), not Choice confidence or Score.",
            },
          );
          const routed = item.task(
            "route-answers",
            {
              input: {
                repeat: item.input.get("item"),
                answers: response.answers,
              },
              run: ({ repeat, answers }) => {
                const rows: Answer[] = Object.keys(questionTexts).map((key) => {
                  const answer = answers[key];
                  if (!answer || answer.type !== "noul")
                    throw new Error(`Missing Noul answer: ${key}`);
                  return {
                    key,
                    probability: answer.noul,
                    decision: decision(answer.noul),
                  };
                });
                return {
                  ...repeat,
                  requestedModel,
                  returnedModel: returnedModels.get(repeat.uid) ?? null,
                  answers: rows,
                  uncertainCount: rows.filter((a) => a.decision === "uncertain")
                    .length,
                };
              },
            },
            {
              title: "Apply the uncertainty band",
              description:
                "P(true) < 0.30 → no; > 0.70 → yes; inclusive [0.30, 0.70] → uncertain. Retain every probability and question-level decision.",
            },
          );
          return item.if(
            "needs-review",
            {
              when: routed.get("uncertainCount").gt(0),
              then: (path) =>
                path.task(
                  "review-queue",
                  {
                    input: routed,
                    run: ({ uncertainCount: _count, ...repeat }): Repeat => ({
                      ...repeat,
                      review: repeat.answers
                        .filter((answer) => answer.decision === "uncertain")
                        .map((answer) => answer.key),
                    }),
                  },
                  {
                    title: "Return questions for human review",
                    description:
                      "The review list contains only uncertain question IDs. No human is contacted and no claim is paid or denied.",
                  },
                ),
              else: (path) =>
                path.task(
                  "no-review",
                  {
                    input: routed,
                    run: ({ uncertainCount: _count, ...repeat }): Repeat => ({
                      ...repeat,
                      review: [],
                    }),
                  },
                  {
                    title: "No uncertain questions",
                    description:
                      "All answers clear the illustrative band. This does not establish correctness or authorize a payout.",
                  },
                ),
            },
            {
              title: "Any uncertain answers?",
              description:
                "Inspect this repeat's review list and both possible continuation paths.",
            },
          );
        },
        {
          title: "15 sequential rubric requests",
          description:
            "Select a repeat and View Flow to inspect its request, threshold decisions and review path. No concurrent model draws.",
        },
      );
      const summary = flow.task(
        "describe-fixtures",
        { input: repeats, run: summarize },
        {
          title: "Compute descriptive statistics",
          description:
            "Calculate each question's mean, range, population standard deviation (divide by 15), and decision counts from actual returned fixture values. No measured quality or consistency claim.",
        },
      );
      return flow.output("noul-results", summary, {
        title: "Synthetic Noul results",
        description:
          "All 210 probabilities, decisions and requested/returned model metadata. Cross-provider experiment excluded.",
      });
    },
  );
}
