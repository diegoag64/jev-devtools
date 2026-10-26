import { readFileSync } from "node:fs";
import { choice, noul, score } from "@typesafe-ai/sdk";
import { defineJevFlow } from "jev-devtools/flow";
import {
  isParallelQuestionsCase,
  parallelQuestionsCases,
  type ParallelQuestionsCase,
} from "./cases.js";
type QuestionSpec = { instructions: string } & (
  | { type: "noul" }
  | { type: "choice"; criteria: Record<string, string> }
  | { type: "score"; criteria: string[] }
);
export const questionSpecs: Record<string, QuestionSpec> = JSON.parse(
  readFileSync(new URL("./questions.json", import.meta.url), "utf8"),
);
export const questionKeys = Object.keys(questionSpecs);
export const repeats = 5;
export const questions = Object.fromEntries(
  Object.entries(questionSpecs).map(([key, q]) => [
    key,
    q.type === "noul"
      ? noul(q.instructions)
      : q.type === "choice"
        ? choice(q.instructions, q.criteria)
        : score(q.instructions, q.criteria),
  ]),
);
export function questionRequest(message: string, keys: string[]) {
  return {
    model: "jev-1.12",
    state: {
      article: { source: "authored-synthetic-briefing", text: message },
    },
    questions: Object.fromEntries(keys.map((key) => [key, questions[key]])),
  };
}
export type SampleAnswer =
  | { type: "noul"; noul: number }
  | {
      type: "choice";
      choice: string;
      confidence: number;
      probabilities: Record<string, number>;
    }
  | { type: "score"; score: number };
export type Observation = {
  key: string;
  metric: string;
  value: number;
  answer: SampleAnswer;
};
export function readMetrics(
  answers: Record<string, SampleAnswer>,
): Observation[] {
  return Object.entries(answers).map(([key, answer]) => {
    const spec = questionSpecs[key];
    if (!spec || spec.type !== answer.type)
      throw new Error("Unexpected question or answer type");
    if (answer.type === "noul")
      return { key, metric: "p(yes)", value: answer.noul, answer };
    if (answer.type === "choice")
      return {
        key,
        metric: "max probability",
        value: Math.max(...Object.values(answer.probabilities)),
        answer,
      };
    if (spec.type !== "score") throw new Error("Expected Score criteria");
    return {
      key,
      metric: "normalized score",
      value: answer.score / (spec.criteria.length - 1),
      answer,
    };
  });
}
export function summarize(values: number[]) {
  if (!values.length) throw new Error("At least one observation required");
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return {
    mean,
    stdev:
      values.length < 2
        ? null
        : Math.sqrt(
            values.reduce((sum, v) => sum + (v - mean) ** 2, 0) /
              (values.length - 1),
          ),
  };
}
type RepeatState = { count: number; runs: Observation[][] };
export type ParallelQuestionsResult = {
  repeats: number;
  batchedRequests: number;
  singleRequests: number;
  rows: {
    key: string;
    instructions: string;
    metric: string;
    batched: Observation[];
    singles: Observation[];
    batchStats: ReturnType<typeof summarize>;
    singleStats: ReturnType<typeof summarize>;
    meanDifference: number;
  }[];
};
export const parallelQuestionsFlow = defineJevFlow<{
  message: string;
  caseId: ParallelQuestionsCase;
}>("Cookbook · Parallel questions", (flow) => {
  const prepared = flow.task(
    "validate-sample",
    {
      input: flow.input,
      run: ({ message, caseId }) => {
        if (
          !isParallelQuestionsCase(caseId) ||
          message !== parallelQuestionsCases[caseId].message
        )
          throw new Error("No parallel questions sample matches this document");
        return { message, keys: questionKeys };
      },
    },
    {
      title: "Prepare the fixed document and 13 questions",
      description:
        "Eight Nouls, two Choices and three Scores. Synthetic answers; the authored document is identical in every request.",
    },
  );
  const batched = flow.loop(
    "batched-repeats",
    {
      initial: { count: 0, runs: [] } as RepeatState,
      input: prepared,
      while: (state) => state.get("count").lt(repeats),
      maxIterations: repeats,
    },
    (iteration) => {
      const response = iteration.jev(
        "batch-request",
        {
          input: iteration.input.get("context"),
          request: ({ message, keys }) => questionRequest(message, keys),
        },
        { title: "One request · all 13 questions" },
      );
      return iteration.task(
        "collect-batch",
        {
          input: {
            state: iteration.input.get("state"),
            answers: response.answers,
          },
          run: ({ state, answers }): RepeatState => ({
            count: state.count + 1,
            runs: [...state.runs, readMetrics(answers)],
          }),
        },
        {
          title: "Read each answer's metric",
          description:
            "Noul p(yes); Choice maximum probability, not confidence; Score divided by its top level.",
        },
      );
    },
    { title: "Batched strategy · five repeats" },
  );
  const singles = flow.loop(
    "single-repeats",
    {
      initial: { count: 0, runs: [] } as RepeatState,
      input: prepared,
      while: (state) => state.get("count").lt(repeats),
      maxIterations: repeats,
    },
    (iteration) => {
      const results = iteration.map(
        "sequential-questions",
        {
          items: iteration.input.get("context").get("keys"),
          input: iteration.input.get("context").get("message"),
          concurrency: 1,
          maxItems: 13,
        },
        (item) => {
          const response = item.jev(
            "single-request",
            {
              input: item.input,
              request: ({ item: key, context: message }) =>
                questionRequest(message, [key]),
            },
            { title: "One request · one question" },
          );
          return item.task(
            "read-single",
            {
              input: response.answers,
              run: (answers) => readMetrics(answers)[0],
            },
            { title: "Read this answer's metric" },
          );
        },
        {
          title: "13 requests · one after another",
          description:
            "Concurrency 1 preserves the source's sequential single-call timing semantics. This sample does not measure model latency.",
        },
      );
      return iteration.task(
        "collect-singles",
        {
          input: { state: iteration.input.get("state"), results },
          run: ({ state, results }): RepeatState => ({
            count: state.count + 1,
            runs: [...state.runs, results],
          }),
        },
        { title: "Collect a complete single-question repeat" },
      );
    },
    { title: "Single-question strategy · five repeats" },
  );
  const comparison = flow.task(
    "compare-strategies",
    {
      input: { batched, singles },
      run: ({ batched, singles }): ParallelQuestionsResult => ({
        repeats: batched.count,
        batchedRequests: batched.runs.length,
        singleRequests: singles.runs.reduce((sum, run) => sum + run.length, 0),
        rows: questionKeys.map((key) => {
          const batchRows = batched.runs.map(
            (run) => run.find((row) => row.key === key)!,
          );
          const singleRows = singles.runs.map(
            (run) => run.find((row) => row.key === key)!,
          );
          const batchStats = summarize(batchRows.map((row) => row.value)),
            singleStats = summarize(singleRows.map((row) => row.value));
          return {
            key,
            instructions: questionSpecs[key].instructions,
            metric: batchRows[0].metric,
            batched: batchRows,
            singles: singleRows,
            batchStats,
            singleStats,
            meanDifference: singleStats.mean - batchStats.mean,
          };
        }),
      }),
    },
    {
      title: "Compare means and sample standard deviations",
      description:
        "Compute n−1 standard deviations from the five returned metrics. Results describe authored fixtures, not model quality or batching independence.",
    },
  );
  return flow.output("comparison", comparison, {
    title: "Review all 13 comparisons",
    description:
      "5 batched versus 65 sequential single requests. No measured cost, timing or savings claims.",
  });
});
