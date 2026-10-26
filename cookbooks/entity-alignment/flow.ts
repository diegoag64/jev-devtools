import { readFileSync } from "node:fs";
import { noul, score } from "@typesafe-ai/sdk";
import { defineJevFlow } from "jev-devtools/flow";
import { entityCases, isEntityCase, type EntityCase } from "./cases.js";
export type Entity = {
  name: string;
  brewery: string;
  style: string;
  abv: string;
};
export type Pair = { id: string; entity_a: Entity; entity_b: Entity };
const pairs: Pair[] = JSON.parse(
  readFileSync(new URL("./pairs.json", import.meta.url), "utf8"),
);
export const levels = [
  "They describe two different products.",
  "They describe closely related products that may or may not be the same one: a variant, a special edition, or a name that could plausibly refer to either.",
  "They describe one and the same product.",
];
export function preparePair({
  caseId,
  message,
}: {
  caseId: EntityCase;
  message: string;
}): Pair {
  if (!isEntityCase(caseId) || message !== entityCases[caseId].message)
    throw new Error("No entity-alignment sample matches this input");
  const id =
    (
      { same: "c446", different: "c427", style: "c100" } as Record<
        string,
        string
      >
    )[caseId] ?? "c428";
  const pair = pairs.find((p) => p.id === id)!;
  // Keep the benchmark's known_same_as label out of inference and routing.
  return { id: pair.id, entity_a: pair.entity_a, entity_b: pair.entity_b };
}
export function alignmentRequest(pair: Pair) {
  return {
    model: "jev-1.12",
    state: { entity_a: pair.entity_a, entity_b: pair.entity_b },
    questions: {
      link_state: score(
        "How do the two entity descriptions relate as products?",
        levels,
      ),
      same_name: noul("Do the two entities state the same beer name?"),
      same_brewery: noul("Are the two entities from the same brewery?"),
      same_style: noul("Do the two entities describe the same beer style?"),
    },
  };
}
export type EntityResult = {
  pair: Pair;
  score: number;
  level: number;
  confidence: number;
  probabilities: Record<string, number>;
  properties: { same_name: number; same_brewery: number; same_style: number };
  abvGap: number;
};
export const entityFlow = defineJevFlow<{
  caseId: EntityCase;
  message: string;
}>("Cookbook · Entity alignment", (flow) => {
  const pair = flow.task(
    "prepare-pair",
    { input: flow.input, run: preparePair },
    {
      title: "Load the candidate pair",
      description:
        "Validate the fixed sample and select both original records. Exclude the benchmark answer from the request.",
    },
  );
  const response = flow.jev(
    "assess-pair",
    { input: pair, request: alignmentRequest },
    {
      title: "One Score + three companion Nouls",
      description:
        "One request for this pair. Score levels mean different, related or identical products; Nouls describe name, brewery and style agreement.",
    },
  );
  const evidence = flow.task(
    "prepare-evidence",
    {
      input: { pair, answers: response.answers },
      run: ({ pair, answers }): EntityResult => ({
        pair,
        score: answers.link_state.score,
        level: Math.min(
          Math.trunc(answers.link_state.score + 0.5),
          levels.length - 1,
        ),
        confidence: answers.link_state.confidence,
        probabilities: answers.link_state.probabilities,
        properties: {
          same_name: answers.same_name.noul,
          same_brewery: answers.same_brewery.noul,
          same_style: answers.same_style.noul,
        },
        abvGap:
          Math.abs(
            Math.round(parseFloat(pair.entity_a.abv) * 100) -
              Math.round(parseFloat(pair.entity_b.abv) * 100),
          ) / 100,
      }),
    },
    {
      title: "Prepare curator evidence",
      description:
        "Compute the nearest semantic level as int(score + 0.5), capped at 2, and the absolute ABV difference in percentage points. Preserve Nouls, level probabilities and Score confidence separately; none overrides the Score route.",
    },
  );
  return flow.branch(
    "below-lower-boundary",
    {
      when: evidence.get("score").lt(0.5),
      then: (path) =>
        path.output("leave-unlinked", evidence, {
          title: "Leave unlinked",
          description:
            "Score < 0.5: the different-product level. No database operation.",
        }),
      else: (path) =>
        path.branch(
          "below-upper-boundary",
          {
            when: evidence.get("score").lt(1.5),
            then: (review) =>
              review.output("curator-review", evidence, {
                title: "Curator review",
                description:
                  "0.5 ≤ Score < 1.5: related, possibly different products. Companion Nouls explain field agreement.",
              }),
            else: (match) =>
              match.output("proposed-same-as", evidence, {
                title: "Proposed sameAs",
                description:
                  "Score ≥ 1.5: same-product level. Return a proposal; no merge or database mutation.",
              }),
          },
          {
            title: "Score < 1.5?",
            description: "Exactly 1.5 takes the proposed sameAs path.",
          },
        ),
    },
    {
      title: "Score < 0.5?",
      description:
        "Exactly 0.5 enters curator review. Only the Score chooses the route.",
    },
  );
});
