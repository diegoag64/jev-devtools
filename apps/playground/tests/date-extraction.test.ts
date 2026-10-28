import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import type { FlowRun } from "jev-devtools/flow";
import {
  dateFlow,
  type DateResult,
} from "../../../cookbooks/date-extraction/flow.js";
import {
  dateCases,
  type DateCase,
} from "../../../cookbooks/date-extraction/cases.js";
import { dateSampleTransport } from "../../../cookbooks/date-extraction/samples.js";
import {
  assemble,
  dateQuestions,
  dateRequest,
  resolveWeekday,
  PARTS,
  TODAY,
  type Parts,
} from "../../../cookbooks/date-extraction/recipe.js";

const absolute = (month = "August", day = "14", year = "2026"): Parts => ({
  mode: { choice: "absolute", confidence: 0.95 },
  month: { choice: month, confidence: 0.9 },
  day: { choice: day, confidence: 0.8 },
  year: { choice: year, confidence: 0.7 },
});
// Port boundary: the original question battery must survive role substitution and SDK dispatch.
test("date questions preserve every source instruction, option and the inclusive year window", () => {
  const raw = readFileSync(
    new URL(
      "../../../cookbooks/date-extraction/questions.json",
      import.meta.url,
    ),
    "utf8",
  );
  const source = JSON.parse(raw);
  assert.equal(
    createHash("sha256").update(raw).digest("hex"),
    "573d159dd1179a3ba429a51cc78e2997b4b7ca1100da8b238059e6502cd6aa88",
  );
  const role = "the deadline to return the form";
  const questions = dateQuestions(role);
  assert.deepEqual(Object.keys(questions), [...PARTS]);
  for (const part of PARTS)
    assert.deepEqual(questions[part], {
      ...source[part],
      instructions: source[part].instructions.replaceAll("{role}", role),
    });
  assert.deepEqual(Object.keys(questions.year.criteria), [
    ...Array.from({ length: 151 }, (_, i) => String(1900 + i)),
    "out_of_range",
    "none",
  ]);
  assert.equal(TODAY, "2026-07-30");
});

test("calendar assembly preserves strict 31-day inference, week conventions, leap and invalid dates", () => {
  for (const [month, day, year, expected] of [
    ["June", "28", "none", "2027-06-28"],
    ["June", "29", "none", "2026-06-29"],
    ["June", "30", "none", "2026-06-30"],
    ["February", "29", "2024", "2024-02-29"],
    ["February", "29", "2026", null],
    ["February", "30", "none", null],
    ["April", "31", "2026", null],
    ["January", "1", "1900", "1900-01-01"],
    ["December", "31", "2050", "2050-12-31"],
    ["January", "1", "out_of_range", null],
    ["none", "1", "2026", null],
    ["January", "none", "2026", null],
  ] as const)
    assert.equal(
      assemble(absolute(month, day, year)).date,
      expected,
      `${month} ${day} ${year}`,
    );
  assert.equal(
    assemble(absolute("February", "29", "none"), "2024-04-01").date,
    null,
    "inferred leap day cannot roll silently into March",
  );
  for (const [weekday, offset, expected] of [
    ["Thursday", "none", "2026-07-30"],
    ["Monday", "none", "2026-08-03"],
    ["Monday", "current", "2026-07-27"],
    ["Monday", "next", "2026-08-03"],
    ["Thursday", "next", "2026-08-06"],
    ["Sunday", "current", "2026-08-02"],
  ])
    assert.equal(resolveWeekday(TODAY, weekday, offset), expected);
  assert.equal(resolveWeekday("2026-12-31", "Monday", "next"), "2027-01-04");
  for (const [anchor, expected] of [
    ["today", TODAY],
    ["tomorrow", "2026-07-31"],
    ["day_after", "2026-08-01"],
    ["none", null],
  ] as const)
    assert.equal(
      assemble({
        mode: { choice: "relative", confidence: 0.9 },
        day_anchor: { choice: anchor, confidence: 0.9 },
      }).date,
      expected,
    );
  assert.equal(
    assemble({ mode: { choice: "none", confidence: 0.99 } }).needsReview,
    true,
  );
  assert.equal(
    assemble({ mode: { choice: "unexpected", confidence: 0.99 } }).date,
    null,
  );
  assert.throws(() => assemble(absolute(), "2026-02-30"), /Invalid reference/);
});

test("minimum confidence uses only consumed parts, preserves strict gate and flags unavailable used confidence", () => {
  for (const [confidence, review] of [
    [0.59999, true],
    [0.6, false],
    [0.60001, false],
  ] as const) {
    const result = assemble({
      ...absolute(),
      year: { choice: "none", confidence },
      day_anchor: { choice: "none", confidence: 0.01 },
    });
    assert.equal(result.confidence, confidence);
    assert.equal(result.needsReview, review);
    assert.deepEqual(
      result.components.filter((c) => c.used).map((c) => c.part),
      ["mode", "month", "day", "year"],
    );
  }
  for (const confidence of [undefined, null, NaN, Infinity, -0.1, 1.1]) {
    const result = assemble({
      ...absolute(),
      day: { choice: "14", confidence },
    });
    assert.equal(result.confidence, 0.7);
    assert.equal(result.needsReview, true);
    assert.equal(result.missingConfidence, true);
  }
  const allMissing = assemble({
    mode: { choice: "relative" },
    day_anchor: { choice: "tomorrow" },
  });
  assert.equal(allMissing.confidence, null);
  assert.equal(allMissing.date, "2026-07-31");
  const relative = assemble({
    mode: { choice: "relative", confidence: 0.85 },
    day_anchor: { choice: "today", confidence: 0.9 },
    year: { choice: "none", confidence: 0.01 },
  });
  assert.equal(relative.confidence, 0.85);
  assert.equal(relative.needsReview, false);
});

const expectedDates: Record<DateCase, (string | null)[]> = {
  official: [
    "2025-01-01",
    "2027-12-31",
    "2026-08-14",
    null,
    "2026-07-30",
    "2026-08-06",
  ],
  calendar: [
    "2026-07-31",
    "2026-08-01",
    "2026-07-30",
    "2026-07-27",
    "2026-08-03",
    "2026-06-29",
    "2027-06-28",
  ],
  invalid: [null, null, null, null, null],
  thresholds: Array(6).fill("2026-07-31"),
};
test("all samples execute real public flows: ordered requests, calendar tasks, selected routes and JSON output", async () => {
  for (const caseId of Object.keys(dateCases) as DateCase[]) {
    const requests: ReturnType<typeof dateRequest>[] = [];
    const sample = dateSampleTransport(caseId, 0);
    const client = new TypeSafeClient({
      apiKey: "sample",
      logLevel: "off",
      compression: false,
      retry: { maxRetries: 0 },
      fetch: async (url, init) => {
        requests.push(JSON.parse(String(init?.body)));
        return sample(url, init);
      },
    });
    let captured: FlowRun | undefined;
    const output = await dateFlow.run(
      { caseId, message: dateCases[caseId].message },
      {
        client,
        devtools: {
          startFlow: () => ({
            update: (run) => {
              captured = run;
            },
            request: (_l, _t, cb) => cb(),
          }),
        },
      },
    );
    const result = output.value as DateResult;
    assert.equal(output.outcome, "date-results");
    assert.equal(requests.length, dateCases[caseId].entries.length);
    requests.forEach((request, i) =>
      assert.deepEqual(
        request,
        dateRequest(
          dateCases[caseId].entries[i].document,
          dateCases[caseId].entries[i].role,
        ),
      ),
    );
    assert.deepEqual(
      result.rows.map((r) => r.date),
      expectedDates[caseId],
    );
    assert.deepEqual(
      result.rows.map((r) => r.id),
      dateCases[caseId].entries.map((e) => e.id),
    );
    assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
    assert.equal(captured?.steps["summarize-dates"].status, "completed");
    const items = captured!.steps["extract-dates"].collection!.items;
    result.rows.forEach((row, i) => {
      assert.equal(items[i].run!.steps["assemble-date"].status, "completed");
      assert.equal(
        items[i].run!.steps["needs-review"].decision,
        row.needsReview,
      );
      assert.equal(
        items[i].run!.steps[row.needsReview ? "review-date" : "accept-date"]
          .status,
        "completed",
      );
      assert.equal(
        items[i].run!.steps[row.needsReview ? "accept-date" : "review-date"]
          .status,
        "untaken",
      );
    });
    if (caseId === "official")
      assert.deepEqual([result.accepted, result.review], [5, 1]);
    if (caseId === "thresholds") {
      assert.deepEqual(
        result.rows.map((r) => r.route),
        ["review", "accept", "accept", "review", "review", "accept"],
      );
      assert.equal(result.rows[4].confidence, null);
    }
  }
});

test("sample restrictions reject altered documents, role questions, model, extra requests and stop after cancellation", async () => {
  const entry = dateCases.official.entries[0],
    expected = dateRequest(entry.document, entry.role);
  for (const body of [
    { ...expected, state: "edited" },
    { ...expected, questions: dateQuestions("different role") },
    { ...expected, model: "other" },
    { ...expected, questions: {} },
  ])
    await assert.rejects(
      dateSampleTransport("official", 0)("https://sample.invalid", {
        body: JSON.stringify(body),
      }),
      /does not match/,
    );
  const sample = dateSampleTransport("official", 0);
  for (const e of dateCases.official.entries)
    await sample("https://sample.invalid", {
      body: JSON.stringify(dateRequest(e.document, e.role)),
    });
  await assert.rejects(
    sample("https://sample.invalid", { body: JSON.stringify(expected) }),
    /extra/,
  );
  let requests = 0;
  const controller = new AbortController();
  const client = new TypeSafeClient({
    apiKey: "sample",
    logLevel: "off",
    retry: { maxRetries: 0 },
    fetch: async () => {
      requests++;
      controller.abort();
      throw new DOMException("Cancelled", "AbortError");
    },
  });
  await assert.rejects(
    dateFlow.run({ caseId: "official", message: "edited" }, { client }),
  );
  assert.equal(requests, 0);
  await assert.rejects(
    dateFlow.run(
      { caseId: "official", message: dateCases.official.message },
      { client, signal: controller.signal },
    ),
  );
  assert.equal(requests, 1);
});
