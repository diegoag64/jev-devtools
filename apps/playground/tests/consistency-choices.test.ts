import type { FlowRun } from "jev-devtools/flow";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TypeSafeClient, type Fetch } from "@typesafe-ai/sdk";
import { consistencyFlow } from "../../../cookbooks/consistency-choices/flow.js";
import {
  consistencyCases,
  type ConsistencyCase,
} from "../../../cookbooks/consistency-choices/cases.js";
import {
  consistencySampleTransport,
  fixtureAnswers,
} from "../../../cookbooks/consistency-choices/samples.js";
import {
  rubric,
  rubricHash,
  post,
  makeRepeats,
  rubricRequest,
} from "../../../cookbooks/consistency-choices/recipe.js";
import {
  aggregate,
  readAnswers,
  type ConsistencyResult,
  type RepeatResult,
} from "../../../cookbooks/consistency-choices/analysis.js";
import { ConsistencyCookbookResult } from "../src/ConsistencyCookbookResult.js";
const near = (actual: number | null, expected: number) =>
  assert.ok(
    actual !== null && Math.abs(actual - expected) < 1e-12,
    `${actual} != ${expected}`,
  );
function client(fetch: Fetch) {
  return new TypeSafeClient({
    apiKey: "sample",
    compression: false,
    fetch,
    logLevel: "off",
    retry: { maxRetries: 0 },
  });
}
async function run(caseId: ConsistencyCase) {
  const requests: ReturnType<typeof rubricRequest>[] = [];
  const transport = consistencySampleTransport(caseId, 0);
  let active = 0,
    peak = 0;
  const result = await consistencyFlow.run(
    { caseId, message: consistencyCases[caseId].message },
    {
      client: client(async (url, init) => {
        active++;
        peak = Math.max(peak, active);
        requests.push(JSON.parse(String(init?.body)));
        try {
          return await transport(url, init);
        } finally {
          active--;
        }
      }),
    },
  );
  return { data: result.value as ConsistencyResult, requests, peak };
}
test("original post/rubric fingerprint and 15 sequential eight-Choice requests survive the real public flow and SDK", async () => {
  // Independent Python json.dumps(sort_keys=True) fingerprint of the reviewed source POST/QUESTIONS.
  assert.equal(rubricHash, "fa84120d8444");
  const { data, requests, peak } = await run("varying");
  assert.equal(peak, 1);
  assert.equal(requests.length, 15);
  assert.equal(new Set(requests.map((r) => r.state.uid)).size, 15);
  assert.notEqual(makeRepeats()[0].uid, requests[0].state.uid);
  const keys = [
    "category",
    "primary_risk",
    "target",
    "action",
    "queue",
    "link_handling",
    "review_path",
    "severity",
  ];
  for (let i = 0; i < 15; i++) {
    const r = requests[i];
    assert.equal(r.model, "jev-latest");
    assert.deepEqual(r.state.post, post);
    assert.match(r.state.uid, new RegExp(`^fa84120d8444:${i}:[0-9a-f]{8}$`));
    assert.deepEqual(Object.keys(r.questions), keys);
    for (const [key, [instructions, criteria]] of Object.entries(rubric))
      assert.deepEqual(r.questions[key], {
        type: "choice",
        instructions,
        criteria,
      });
    assert.deepEqual(data.samples[i].answers, fixtureAnswers("varying", i));
    assert.equal(data.samples[i].uid, r.state.uid);
  }
  near(data.stats.rawAgreement, 101 / 120);
  near(data.stats.policyAgreement, 110 / 120);
  near(data.stats.uncertainRate, 35 / 120);
  near(data.stats.automaticRate, 85 / 120);
  assert.equal(data.stats.conflicts, 1);
  assert.equal(
    data.rows
      .find((r) => r.key === "primary_risk")!
      .cells.filter((c) => c.decision === "uncertain").length,
    15,
  );
});
test("real flow accepts exactly 0.60 and above, abstains below it regardless of opposite Choice confidence, and preserves stable-label variation", async () => {
  const { data } = await run("boundaries");
  assert.deepEqual(
    data.rows[0].cells.slice(0, 3).map((c) => [c.topProbability, c.decision]),
    [
      [0.599, "uncertain"],
      [0.6, "Violence"],
      [0.601, "Violence"],
    ],
  );
  assert.deepEqual(
    data.samples.slice(0, 3).map((s) => s.answers.category.confidence),
    [0.99, 0.1, 0.1],
  );
  near(data.stats.policyAgreement, 2 / 3);
  near(data.stats.uncertainRate, 1 / 3);
  const stable = (await run("stable")).data;
  near(stable.stats.rawAgreement, 1);
  near(stable.stats.policyAgreement, 1);
  near(stable.stats.maxProbabilityStd, Math.sqrt(1 / 600));
  // 37 label columns: 16 varying columns; average std is over labels, not per-question means.
  near(stable.stats.meanProbabilityStd, (16 / 37) * Math.sqrt(1 / 600));
});
test("argmax ignores returned choice/confidence; ties retain rubric order; missing values and out-of-range decisions do not get normalized or silently counted as abstentions", async () => {
  const probes = [
    [[0.5, 0.5], "None", "uncertain"],
    [[0.6, 0.6], "None", "None"], // no normalization, just as upstream
    [[0.599, 0.401], "None", "uncertain"],
    [[0.6, 0.4], "None", "None"],
    [[0.601, 0.399], "None", "None"],
    [[0.8, null], null, null],
    [[0.8, "not-a-number"], null, null],
    [[null, 0], null, null], // JSON representation of a nonfinite value
    [[1.1, -0.1], "None", null],
  ] as const;
  let index = 0;
  const fake = client(async () => {
    const answers = fixtureAnswers("boundaries", 1);
    answers.category.choice = "Spam";
    answers.category.confidence = 0;
    const values = probes[index++ % probes.length][0];
    return Response.json({
      model: "synthetic-contradiction-probe",
      answers: {
        ...answers,
        category: {
          ...answers.category,
          probabilities: {
            None: values[0],
            Harass: values[1],
            Hate: 0,
            Violence: 0,
            Spam: 0,
            Sexual: 0,
          },
        },
      },
    });
  });
  const result = await consistencyFlow.run(
    { caseId: "boundaries", message: consistencyCases.boundaries.message },
    { client: fake },
  );
  const data = result.value as ConsistencyResult;
  assert.equal(data.samples[0].answers.category.choice, "Spam");
  probes.forEach(([, raw, decision], i) => {
    assert.equal(data.rows[0].cells[i].rawLabel, raw);
    assert.equal(data.rows[0].cells[i].decision, decision);
  });
  const repeats: RepeatResult[] = Array.from({ length: 15 }, (_, index) => {
    const answers = fixtureAnswers("stable", 1);
    if (index === 0) delete answers.category.probabilities.None;
    return {
      index,
      uid: String(index),
      source: "synthetic",
      answers,
      cells: readAnswers(answers).map((cell) => ({
        ...cell,
        decision: cell.valid ? cell.rawLabel : null,
      })),
    };
  });
  const stats = aggregate(repeats).stats;
  near(stats.rawAgreement, 119 / 120);
  near(stats.policyAgreement, 119 / 120);
  near(stats.parseFailureRate, 1 / 120);
  near(stats.decisionFailureRate, 1 / 120);
  near(stats.uncertainRate, 0);
  near(stats.automaticRate, 119 / 120);
  near(stats.meanProbabilityStd, 0);
});
// Source oracle: Python float(value), then math.isfinite. Exercise the real SDK
// response boundary: its declared number type does not sanitize numeric strings.
test("Python-compatible probability strings reject radix literals without discarding decimal, exponent, underscore or Unicode forms", async () => {
  const input = {
    caseId: "stable" as const,
    message: consistencyCases.stable.message,
  };
  const hexadecimal = await consistencyFlow.run(input, {
    client: client(async () => {
      const answers = fixtureAnswers("stable", 0);
      return Response.json({
        model: "synthetic-parser-probe",
        answers: {
          ...answers,
          category: {
            ...answers.category,
            probabilities: {
              None: 0,
              Harass: 0,
              Hate: 0,
              Violence: "0x1",
              Spam: 0,
              Sexual: 0,
            },
          },
        },
      });
    }),
  });
  const hex = hexadecimal.value as ConsistencyResult;
  assert.ok(
    hex.rows[0].cells.every(
      (cell) => cell.rawLabel === null && cell.decision === null && !cell.valid,
    ),
    "hexadecimal is a parse failure, never an automatic label",
  );
  near(hex.rows[0].rawAgreement, 0);
  near(hex.rows[0].policyAgreement, 0);
  near(hex.stats.parseFailureRate, 1 / 8);
  near(hex.stats.decisionFailureRate, 1 / 8);
  near(hex.stats.rawAgreement, 7 / 8);
  near(hex.stats.policyAgreement, 7 / 8);
  near(hex.stats.automaticRate, 7 / 8);
  near(hex.stats.uncertainRate, 0);
  assert.equal(hex.samples[0].answers.category.probabilities.Violence, "0x1");

  // Expected numbers checked independently with Python's float(), not this parser.
  const probes: [unknown, number | null][] = [
    ["0x1", null],
    ["0b1", null],
    ["0o1", null],
    ["  +.6e+0  ", 0.6],
    ["6.e-1", 0.6],
    ["0_0.6_0", 0.6],
    ["6_0e-2", 0.6],
    ["０.６", 0.6],
    ["٠.٦", 0.6],
    ["𝟢.𝟨", 0.6],
    ["\u00850.6\u0085", 0.6],
    ["\ufeff0.6", null],
    ["\u001c0.6", null],
    ["0._6", null],
    ["0.6_", null],
    ["0__6", null],
    ["0.6junk", null],
    ["", null],
    [" ", null],
    ["0.6 0", null],
    ["NaN", null],
    ["-Infinity", null],
    ["1e309", null],
    ["1e-9999", 0],
    ["+0.599", 0.599],
    [".600", 0.6],
    ["6.01E-1", 0.601],
    [true, 1],
    [false, 0],
    [null, null],
    [[], null],
    [{}, null],
    ["²", null],
    ["-0.1", -0.1],
    ["1.1", 1.1],
  ];
  let repeat = 0;
  const result = await consistencyFlow.run(input, {
    client: client(async () => {
      const answers = fixtureAnswers("stable", 0);
      const index = repeat++;
      return Response.json({
        model: "synthetic-parser-probe",
        answers: Object.fromEntries(
          Object.entries(answers).map(([key, answer], q) => [
            key,
            {
              ...answer,
              probabilities: Object.fromEntries(
                Object.keys(answer.probabilities).map((label, i) => [
                  label,
                  i === 0 ? probes[(index * 8 + q) % probes.length][0] : 0,
                ]),
              ),
            },
          ]),
        ),
      });
    }),
  });
  const data = result.value as ConsistencyResult;
  assert.equal(repeat, 15);
  data.samples.forEach((sample, index) =>
    sample.cells.forEach((cell, q) => {
      const [raw, expected] = probes[(index * 8 + q) % probes.length];
      assert.equal(cell.values[0], expected, JSON.stringify(raw));
      assert.deepEqual(
        sample.answers[cell.key].probabilities[cell.labels[0]],
        raw,
      );
      assert.equal(
        cell.valid,
        expected !== null && expected >= 0 && expected <= 1,
      );
      assert.equal(
        cell.decision,
        expected === null || expected < 0 || expected > 1
          ? null
          : expected >= 0.6
            ? cell.labels[0]
            : "uncertain",
      );
    }),
  );
});
test("server-side flow and fixture validation reject edited input, wrong model/rubric/state/order; cancellation settles transport and dispatches no queued repeat", async () => {
  let calls = 0;
  await assert.rejects(
    consistencyFlow.run(
      { caseId: "varying", message: "edited" },
      {
        client: client(async () => {
          calls++;
          throw Error("unexpected");
        }),
      },
    ),
    /No consistency sample/,
  );
  assert.equal(calls, 0);
  const request = rubricRequest(makeRepeats()[0]);
  for (const changed of [
    { ...request, model: "other" },
    { ...request, questions: {} },
    { ...request, state: { ...request.state, post: {} } },
    rubricRequest(makeRepeats()[1]),
  ])
    await assert.rejects(
      consistencySampleTransport("varying", 0)("https://sample.invalid", {
        body: JSON.stringify(changed),
      }),
      /does not match/,
    );
  let start!: () => void, settled!: () => void;
  const started = new Promise<void>((resolve) => {
    start = resolve;
  });
  const finished = new Promise<void>((resolve) => {
    settled = resolve;
  });
  const controller = new AbortController();
  const slow = consistencySampleTransport("varying", 10_000);
  let observed: FlowRun | undefined;
  const running = consistencyFlow.run(
    { caseId: "varying", message: consistencyCases.varying.message },
    {
      signal: controller.signal,
      devtools: {
        startFlow: () => ({
          update: (run) => {
            observed = run;
          },
          request: (_link, _trace, callback) => callback(),
        }),
      },
      client: client(async (url, init) => {
        calls++;
        start();
        try {
          return await slow(url, init);
        } finally {
          settled();
        }
      }),
    },
  );
  const rejected = assert.rejects(running);
  await started;
  controller.abort();
  await rejected;
  await finished;
  assert.equal(calls, 1);
  assert.ok(observed);
  assert.equal(observed.steps.statistics.startedAt, undefined);
  const items = observed.steps.repeats.collection!.items;
  assert.equal(items[0].run!.steps.argmax.startedAt, undefined);
  assert.ok(items.slice(1).every((item) => item.run === undefined));
});
test("result renders every heatmap cell, exact boundary values and separate confidence without claiming measured consistency", async () => {
  const { data } = await run("boundaries");
  const html = renderToStaticMarkup(
    createElement(ConsistencyCookbookResult, { result: { value: data } }),
  );
  assert.equal((html.match(/class="consistency-cell"/g) ?? []).length, 120);
  for (const text of [
    "0.599",
    "0.600",
    "0.601",
    "separate API confidence",
    "not measured model consistency",
    "all 120 answers",
    "Raw response for this repeat",
  ])
    assert.ok(html.includes(text), text);
});
