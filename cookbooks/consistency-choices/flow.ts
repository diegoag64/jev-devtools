import { defineJevFlow, all } from "jev-devtools/flow";
import {
  consistencyCases,
  isConsistencyCase,
  type ConsistencyCase,
} from "./cases.js";
import {
  makeRepeats,
  rubricRequest,
  MIN_PROBABILITY,
  rubric,
} from "./recipe.js";
import {
  aggregate,
  readAnswers,
  type Cell,
  type RepeatResult,
} from "./analysis.js";
export const consistencyFlow = defineJevFlow<{
  message: string;
  caseId: ConsistencyCase;
}>("Cookbook · Choice self-consistency", (flow) => {
  const repeats = flow.task(
    "prepare-repeats",
    {
      input: flow.input,
      run: ({ message, caseId }) => {
        if (
          !isConsistencyCase(caseId) ||
          message !== consistencyCases[caseId].message
        )
          throw new Error("No consistency sample matches this input");
        return makeRepeats();
      },
    },
    {
      title: "Prepare 15 distinct request states",
      description:
        "Keep the original post and rubric. Each uid contains the rubric hash, zero-based repeat index and fresh random hex token. This is not identical-input sampling.",
    },
  );
  const samples = flow.map(
    "repeats",
    { items: repeats, input: {}, concurrency: 1, maxItems: 15 },
    (repeat) => {
      const response = repeat.jev(
        "rubric",
        { input: repeat.input.get("item"), request: rubricRequest },
        {
          title: "Ask all eight Choice questions",
          description:
            "One sequential request per repeat. Authored synthetic responses, no external inference.",
        },
      );
      const analyzed = repeat.task(
        "argmax",
        { input: response.answers, run: readAnswers },
        {
          title: "Read ordered probability vectors",
          description:
            "Retain every label probability. Raw picks use argmax with rubric-order ties; API choice and confidence remain separate raw fields.",
        },
      );
      const cells = Object.keys(rubric).map((key, index) => {
        const cell = analyzed.get(index);
        return repeat.if(
          `gate-${key}`,
          {
            when: all(
              cell.get("valid").eq(true),
              cell.get("gateProbability").gte(MIN_PROBABILITY),
            ),
            then: (path) =>
              path.task(
                `select-${key}`,
                {
                  input: cell,
                  run: (value): Cell => ({
                    ...value,
                    decision: value.rawLabel,
                  }),
                },
                {
                  title: `${key} · select argmax`,
                  description:
                    "A valid top probability at or above 0.60 selects a label. The recipe calls this automatic; a label may still mean Escalate or Human.",
                },
              ),
            else: (path) =>
              path.task(
                `abstain-${key}`,
                {
                  input: cell,
                  run: (value): Cell => ({
                    ...value,
                    decision: value.valid ? "uncertain" : null,
                  }),
                },
                {
                  title: `${key} · abstain or fail`,
                  description:
                    "Below 0.60 becomes uncertain for human review. Unusable vectors stay failures and never count as repeated decisions.",
                },
              ),
          },
          {
            title: `${key} · top probability ≥ 0.60?`,
            description:
              "Requires a valid vector. Application policy uses maximum probability, independent of Choice confidence. No Score is involved.",
          },
        );
      });
      return repeat.task(
        "retain-repeat",
        {
          input: {
            repeat: repeat.input.get("item"),
            answers: response.answers,
            cells,
          },
          run: ({ repeat, answers, cells }): RepeatResult => ({
            ...repeat,
            source: "synthetic",
            answers,
            cells,
          }),
        },
        { title: "Keep the raw response and decisions" },
      );
    },
    {
      title: "15 sequential rubric requests",
      description:
        "Select a repeat to inspect its request, probability analysis and per-question routing. Fixed fixtures demonstrate calculations, not measured consistency.",
    },
  );
  const result = flow.task(
    "statistics",
    { input: samples, run: aggregate },
    {
      title: "Aggregate agreement and probability variation",
      description:
        "Plurality counts divided by all 15 repeats, then averaged over eight questions. Abstention/automatic/failure shares use all 120 answers. Population standard deviation per label, then mean/max over labels.",
    },
  );
  return flow.output("consistency-report", result, {
    title: "Synthetic consistency report",
    description:
      "Every raw answer retained. Agreement measures repeatability, not correctness; no quality, provider, timing or cost comparison.",
  });
});
