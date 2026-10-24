import { test } from "node:test";
import assert from "node:assert/strict";
import { TypeSafeClient, type Fetch } from "@typesafe-ai/sdk";
import { createSkillSuggestionFlow } from "../../../cookbooks/skill-suggestion/flow.js";
import { skillCases } from "../../../cookbooks/skill-suggestion/cases.js";
import { skillSampleTransport } from "../../../cookbooks/skill-suggestion/samples.js";
const options = (fetch: Fetch) => ({
  apiKey: "sample-only",
  fetch,
  logLevel: "off" as const,
  compression: false as const,
  retry: { maxRetries: 0 },
});

test("official skill flow preserves both gates, the complete roster, runtime fit keys and Choice winner", async () => {
  for (const [caseId, outcome, calls] of [
    ["deck", "suggest-skill", 2],
    ["explain", "no-skill-needed", 1],
    ["unsupported", "nothing-fits", 2],
  ] as const) {
    const requests: any[] = [];
    const fixture = skillSampleTransport(caseId, 0);
    const flow = createSkillSuggestionFlow();
    const result = await flow.run(
      { message: skillCases[caseId].message },
      {
        client: new TypeSafeClient(
          options(async (url, init) => {
            requests.push(JSON.parse(String(init?.body)));
            return fixture(url, init);
          }),
        ),
      },
    );
    const value = result.value as any;
    assert.equal(result.outcome, outcome);
    assert.equal(requests.length, calls);
    assert.equal(Object.keys(requests[0].questions.which.criteria).length, 182);
    assert.deepEqual(Object.keys(requests[0].questions), [
      "which",
      "gate::acts_on_user_system",
      "gate::would_follow_documented_procedure",
      "gate::prose_suffices",
    ]);
    assert.equal(requests[0].model, "jev-1.12");
    assert.deepEqual(requests[0].state, {
      request: skillCases[caseId].message,
      recent_context: "",
    });
    assert.ok(
      Math.abs(value.gate - (caseId === "explain" ? 0.06 : 2.75 / 3)) < 1e-12,
    );
    if (caseId === "deck") {
      assert.deepEqual(Object.keys(requests[1].questions.which.criteria), [
        "powerpoint",
        "pptx-author",
        "computer-use",
      ]);
      assert.deepEqual(Object.keys(requests[1].questions), [
        "which",
        "fits::powerpoint",
        "fits::pptx-author",
        "fits::computer-use",
      ]);
      assert.deepEqual(requests[1].state, requests[0].state);
      assert.deepEqual(value.suggestions, ["pptx-author"]);
      assert.equal(value.winner, "pptx-author");
      assert.equal(value.bestFit, 0.82);
      assert.equal(value.fits["pptx-author"], 0.68);
      assert.ok(
        value.suggestionBlock.includes(
          "Relevant to the current request: pptx-author.",
        ),
      );
      for (const candidate of value.shortlist) {
        assert.ok(Array.from(candidate.excerpt).length <= 700);
        assert.equal(
          requests[1].questions.which.criteria[candidate.name],
          `${candidate.description} — ${candidate.excerpt}`,
        );
      }
    } else {
      assert.deepEqual(value.suggestions, []);
      assert.equal(
        value.suggestionBlock,
        "\n\n<skill_relevance>\nNo skill in the roster appears relevant to this request.\n</skill_relevance>",
      );
    }
  }
});

test("official thresholds are inclusive at 0.30 and reject just below it", async () => {
  for (const [acts, fit, expected, count] of [
    [0.9, 0.3, "suggest-skill", 2],
    [0.8997, 0.9, "no-skill-needed", 1],
    [0.9, 0.2999, "nothing-fits", 2],
  ] as const) {
    let requests = 0;
    const client = new TypeSafeClient(
      options(async (_url, init) => {
        requests++;
        const request = JSON.parse(String(init?.body));
        const first = !!request.questions["gate::prose_suffices"];
        const answers: Record<string, unknown> = {
          which: {
            type: "choice",
            choice: "pptx-author",
            probabilities: {
              powerpoint: 0.7,
              "pptx-author": 0.2,
              "computer-use": 0.1,
            },
            confidence: 0.1,
          },
        };
        if (first)
          for (const [name, value] of Object.entries({
            acts_on_user_system: acts,
            would_follow_documented_procedure: 0,
            prose_suffices: 1,
          }))
            answers[`gate::${name}`] = { type: "noul", noul: value };
        else
          for (const [name, value] of Object.entries({
            powerpoint: fit,
            "pptx-author": 0.02,
            "computer-use": 0.01,
          }))
            answers[`fits::${name}`] = { type: "noul", noul: value };
        return Response.json({ model: "boundary-fixture", answers });
      }),
    );
    const result = await createSkillSuggestionFlow().run(
      { message: "Boundary case" },
      { client },
    );
    assert.equal(result.outcome, expected);
    assert.equal(requests, count);
  }
});

test("synthetic cases reject edited inputs rather than silently returning unrelated results", async () => {
  const client = new TypeSafeClient(options(skillSampleTransport("deck", 0)));
  await assert.rejects(
    createSkillSuggestionFlow().run({ message: "Different input" }, { client }),
    /No synthetic fixture matches/,
  );
});
