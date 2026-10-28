import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { FlowRun, FlowObserver } from "jev-devtools/flow";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import {
  confidenceCases,
  type ConfidenceCase,
} from "../../../cookbooks/confidence-fallback/cases.js";
import {
  confidenceFlow,
  industryRequest,
  type ConfidenceResult,
} from "../../../cookbooks/confidence-fallback/flow.js";
import { confidenceSampleTransport } from "../../../cookbooks/confidence-fallback/samples.js";
import {
  groups,
  industries,
  describe,
  division,
} from "../../../cookbooks/confidence-fallback/taxonomy.js";
function run(
  caseId: ConfidenceCase,
  message: string = confidenceCases[caseId].message,
) {
  const snapshots: FlowRun[] = [];
  const links: string[] = [];
  const observer: FlowObserver = {
    startFlow: () => ({
      update: (run) => {
        snapshots.push(structuredClone(run));
      },
      request: (link, _onTrace, callback) => {
        links.push(link.stepId);
        return callback();
      },
    }),
  };
  const requests: ReturnType<typeof industryRequest>[] = [];
  const sample = confidenceSampleTransport(caseId, 0);
  const client = new TypeSafeClient({
    apiKey: "sample",
    compression: false,
    logLevel: "off",
    retry: { maxRetries: 0 },
    fetch: (url, init) => {
      requests.push(JSON.parse(String(init?.body)));
      return sample(url, init);
    },
  });
  return {
    requests,
    snapshots,
    links,
    result: confidenceFlow.run(
      { caseId, message },
      { client, devtools: observer },
    ),
  };
}
// The cookbook owns the request shape and gate; generic flow tests cannot protect
// an accidental probability gate, strict >, second call, or constant fallback.
test("confidence cutoff uses API confidence inclusively, requests all 75 groups exactly once, and executes the selected task", async () => {
  for (const [caseId, confidence, group, level, label, largest] of [
    ["below", 0.899, "38", "division", "manufacturing", 0.95],
    ["equal", 0.9, "60", "group", "60", 0.65],
    ["above", 0.901, "20", "group", "20", 0.75],
    ["services", 0.22, "87", "division", "services", 0.45],
  ] as const) {
    const { requests, snapshots, links, result } = run(caseId);
    const completed = await result;
    const value = completed.value as ConfidenceResult;
    assert.equal(completed.outcome, "classification");
    assert.deepEqual(
      [
        value.confidence,
        value.group,
        value.level,
        value.label,
        value.largestProbability,
      ],
      [confidence, group, level, label, largest],
    );
    assert.equal(requests.length, 1);
    assert.deepEqual(links, ["classify-industry"]);
    const steps = snapshots.at(-1)!.steps;
    assert.equal(steps["confident-group"].decision, level === "group");
    assert.equal(
      steps["report-group"].status,
      level === "group" ? "completed" : "untaken",
    );
    assert.equal(
      steps["lookup-parent-division"].status,
      level === "division" ? "completed" : "untaken",
    );
    assert.equal(steps["assemble-result"].status, "completed");
    assert.equal(requests[0].model, "jev-1.12");
    assert.equal(requests[0].state, confidenceCases[caseId].message);
    assert.deepEqual(Object.keys(requests[0].questions), ["group"]);
    assert.equal(requests[0].questions.group.type, "choice");
    assert.equal(
      requests[0].questions.group.instructions,
      "Which broad industry does this company operate in? Judge the company's own operations as this filing describes them.",
    );
    assert.deepEqual(
      Object.keys(requests[0].questions.group.criteria).sort(),
      Object.keys(groups).sort(),
    );
    assert.equal(Object.keys(value.probabilities).length, 75);
    assert.ok(
      Math.abs(
        Object.values(value.probabilities).reduce((a, b) => a + b, 0) - 1,
      ) < 1e-12,
    );
    assert.equal(value.groupDescription, describe(group));
  }
});
test("pinned taxonomy keeps 444 original codes, 75 groups, description rules and every division range", () => {
  const root = new URL(
    "../../../cookbooks/confidence-fallback/",
    import.meta.url,
  );
  const provenance = JSON.parse(
    readFileSync(new URL("provenance.json", root), "utf8"),
  );
  assert.equal(
    createHash("sha256")
      .update(readFileSync(new URL("sic_codes.tsv", root)))
      .digest("hex"),
    provenance.taxonomy.sha256,
  );
  assert.equal(Object.keys(industries).length, 444);
  assert.equal(Object.keys(groups).length, 75);
  assert.equal(describe("01"), "agricultural production-crops");
  assert.equal(
    describe("35"),
    groups["35"]
      .slice(0, 8)
      .map((code) => industries[code])
      .join("; "),
  );
  assert.equal(describe("20").split(" — includes: ")[1].split("; ").length, 8);
  assert.match(
    describe("20"),
    /^food and kindred products — includes: meat packing plants;/,
  );
  const ranges = [
    [1, 9, "agriculture, forestry and fishing"],
    [10, 14, "mining"],
    [15, 17, "construction"],
    [20, 39, "manufacturing"],
    [40, 49, "transportation, communications and utilities"],
    [50, 51, "wholesale trade"],
    [52, 59, "retail trade"],
    [60, 67, "finance, insurance and real estate"],
    [70, 89, "services"],
    [91, 99, "public administration"],
  ] as const;
  for (const group of Object.keys(groups)) {
    const expected = ranges.find(
      ([low, high]) => Number(group) >= low && Number(group) <= high,
    )![2];
    assert.equal(division(group), expected);
  }
  assert.equal(division("99"), "public administration"); // Preserve source convention, including this unusual mapping.
  assert.throws(() => division("19"), /Unknown SIC group/);
});
test("server-side sample boundary rejects changed inputs, prompts, criteria and model", async () => {
  const { requests, result } = run("below", "edited document");
  await assert.rejects(result, /No confidence sample matches/);
  assert.equal(requests.length, 0);
  const sample = confidenceSampleTransport("below", 0);
  const request = industryRequest(confidenceCases.below.message);
  for (const changed of [
    { ...request, state: "edited" },
    { ...request, model: "other" },
    {
      ...request,
      questions: {
        group: { ...request.questions.group, instructions: "changed" },
      },
    },
    {
      ...request,
      questions: {
        group: { ...request.questions.group, criteria: { "38": "only one" } },
      },
    },
  ])
    await assert.rejects(
      sample("https://sample.invalid", { body: JSON.stringify(changed) }),
      /does not match/,
    );
});

test("cancelled classification stops before the parent task and result", async () => {
  const controller = new AbortController();
  let count = 0;
  let latest: FlowRun | undefined;
  let started!: () => void;
  const requested = new Promise<void>((resolve) => {
    started = resolve;
  });
  const sample = confidenceSampleTransport("below", 10000);
  const client = new TypeSafeClient({
    apiKey: "sample",
    logLevel: "off",
    retry: { maxRetries: 0 },
    fetch: (url, init) => {
      count++;
      started();
      return sample(url, init);
    },
  });
  const running = confidenceFlow.run(
    { caseId: "below", message: confidenceCases.below.message },
    {
      client,
      signal: controller.signal,
      devtools: {
        startFlow: () => ({
          update: (run) => {
            latest = structuredClone(run);
          },
          request: (_link, _onTrace, callback) => callback(),
        }),
      },
    },
  );
  const rejected = assert.rejects(running);
  await requested;
  controller.abort();
  await rejected;
  assert.equal(count, 1);
  assert.notEqual(latest!.steps["lookup-parent-division"].status, "completed");
  assert.notEqual(latest!.steps["assemble-result"].status, "completed");
});
