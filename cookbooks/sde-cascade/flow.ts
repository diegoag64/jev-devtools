import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { noul } from "@typesafe-ai/sdk";
import { defineJevFlow } from "jev-devtools/flow";
import { isSdeCase, sdeCases, type SdeCase, type Extraction } from "./cases.js";

type Criteria = { true: string; false: string };
const prompts: {
  EXTRACT_SYSTEM: string;
  MAIN_QUESTIONS: Record<string, [string, Criteria]>;
  ABSENCE_QUESTION: string;
  ABSENCE_CRITERIA: Criteria;
  OVERALL_JUDGE: string;
  OVERALL_JUDGE_CRITERIA: Criteria;
} = JSON.parse(
  readFileSync(new URL("./verifier-prompts.json", import.meta.url), "utf8"),
);
export const schema = {
  type: "object",
  properties: {
    registration_open_date: {
      type: "string",
      description:
        "Registration opening date, formatted as YYYY-MM-DD; empty when not reported.",
    },
    description: {
      type: "string",
      description:
        "Description of the registration event, e.g. Registration opens for the fall semester; empty when not reported.",
    },
  },
  required: ["registration_open_date", "description"],
};
export function verifyRequest(document: string, extraction: Extraction) {
  const questions: Record<string, ReturnType<typeof noul>> = {
    "__overall__::judge": noul(
      prompts.OVERALL_JUDGE,
      prompts.OVERALL_JUDGE_CRITERIA,
    ),
  };
  for (const [name, extracted_field] of Object.entries(extraction)) {
    const property = schema.properties[name as keyof Extraction];
    const field_spec = {
      path: name,
      type: property.type,
      description: property.description,
      required: schema.required.includes(name),
    };
    const metrics =
      extracted_field === ""
        ? {
            absence_wrong: [
              prompts.ABSENCE_QUESTION,
              prompts.ABSENCE_CRITERIA,
            ] as [string, Criteria],
          }
        : prompts.MAIN_QUESTIONS;
    for (const [metric, [main_question, criteria]] of Object.entries(metrics)) {
      questions[`${name}::${metric}`] = noul(
        { field_spec, extracted_field, main_question },
        criteria,
      );
    }
  }
  return {
    model: "jev-1.12",
    state: {
      system_message: prompts.EXTRACT_SYSTEM,
      instruction: "Extract the structured record from this document",
      source_text: document,
      schema,
      extraction,
    },
    questions,
  };
}
export const FIRE_THRESHOLD = 0.7;
export function evaluateFlags(
  answers: Record<string, { type: "noul"; noul: number }>,
) {
  const flags = Object.entries(answers)
    .filter(([id]) => !id.startsWith("__overall__"))
    .map(([id, answer]) => ({
      id,
      probability: answer.noul,
      fires: answer.noul > FIRE_THRESHOLD,
    }));
  return {
    maxFieldProbability: Math.max(0, ...flags.map((f) => f.probability)),
    overall: answers["__overall__::judge"].noul,
    flags,
  };
}
export type SdeResult = ReturnType<typeof evaluateFlags> & {
  route: "strong" | "cheap";
  before: Extraction;
  final: Extraction;
  changes: { field: string; before: string; after: string }[];
};
/** Both extractors are local fixtures. Replace their callbacks explicitly for live providers. */
export function createSdeFlow(delayMs = 500) {
  return defineJevFlow<{ message: string; caseId: SdeCase }>(
    "Cookbook · SDE cascade",
    (flow) => {
      const candidate = flow.task(
        "cheap-extraction",
        {
          input: flow.input,
          run: async ({ caseId, message }, { signal }) => {
            if (!isSdeCase(caseId) || message !== sdeCases[caseId].message)
              throw new Error("No SDE sample matches this document");
            await delay(delayMs, undefined, { signal });
            return sdeCases[caseId].cheap;
          },
        },
        {
          title: "Cheap extraction · sample",
          description:
            "A fixed candidate stands in for the inexpensive extractor. Compare it against the document in the verification request.",
        },
      );
      const verification = flow.jev(
        "verify-record",
        {
          input: { document: flow.input.get("message"), extraction: candidate },
          request: ({ document, extraction }) =>
            verifyRequest(document, extraction),
        },
        {
          title: "Verify every extracted field",
          description:
            "One Jev request: seven checks per nonempty field, one absence check per empty field, and a separate overall judgment.",
        },
      );
      const assessment = flow.task(
        "field-flags",
        {
          input: verification.answers,
          run: evaluateFlags,
        },
        {
          title: "Read per-field flags",
          description:
            "Only per-field probabilities drive escalation. The overall judge is retained for inspection and excluded from this gate.",
        },
      );
      const selected = flow.if(
        "escalate",
        {
          when: assessment.get("maxFieldProbability").gt(FIRE_THRESHOLD),
          then: (path) =>
            path.task(
              "strong-extraction",
              {
                input: {
                  caseId: path.input.get("caseId"),
                  document: path.input.get("message"),
                },
                run: async ({ caseId }, { signal }) => {
                  await delay(delayMs, undefined, { signal });
                  return {
                    route: "strong" as const,
                    record: sdeCases[caseId].strong,
                  };
                },
              },
              {
                title: "Stronger extraction · sample",
                description:
                  "A field flag exceeded 70%. Use the stronger extractor's fixture; no external model is called.",
              },
            ),
          else: (path) =>
            path.task(
              "keep-cheap",
              {
                input: candidate,
                run: (record) => ({ route: "cheap" as const, record }),
              },
              {
                title: "Keep the cheap extraction",
                description:
                  "No field flag is above 70%. Exactly 70% and a high overall judge alone do not trigger escalation.",
              },
            ),
        },
        {
          title: "Does any field need escalation?",
          description:
            "Escalate only when the highest per-field flag is strictly greater than 0.70 (70%).",
        },
      );
      const final = flow.task(
        "compare-records",
        {
          input: { selected, before: candidate, assessment },
          run: ({ selected, before, assessment }): SdeResult => ({
            route: selected.route,
            before,
            final: selected.record,
            ...assessment,
            changes: Object.keys(before).flatMap((key) => {
              const field = key as keyof Extraction;
              return before[field] === selected.record[field]
                ? []
                : [
                    {
                      field,
                      before: before[field],
                      after: selected.record[field],
                    },
                  ];
            }),
          }),
        },
        {
          title: "Compare the final record",
          description:
            "Both paths rejoin here. Review changed fields and the selected record; the stronger result is not reverified in this recipe.",
        },
      );
      return flow.output("extraction-result", final, {
        title: "Final structured record",
        description:
          "Synthetic walkthrough of the official cascade policy, not an accuracy or cost evaluation.",
      });
    },
  );
}
export const sdeFlow = createSdeFlow();
