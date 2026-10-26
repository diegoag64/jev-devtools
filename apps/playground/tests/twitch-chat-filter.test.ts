import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { TypeSafeClient, type Fetch } from "@typesafe-ai/sdk";
import type { FlowRun } from "jev-devtools/flow";
import chat from "../../../cookbooks/twitch-chat-filter/chat.json" with { type: "json" };
import {
  twitchFlow,
  messageRequest,
  type TwitchResult,
} from "../../../cookbooks/twitch-chat-filter/flow.js";
import {
  twitchCases,
  type TwitchCase,
} from "../../../cookbooks/twitch-chat-filter/cases.js";
import {
  fixtures,
  stream,
} from "../../../cookbooks/twitch-chat-filter/fixtures.js";
import { twitchSampleTransport } from "../../../cookbooks/twitch-chat-filter/samples.js";
import {
  decide,
  QUIET,
  questions,
} from "../../../cookbooks/twitch-chat-filter/recipe.js";
const clientFor = (fetch: Fetch) =>
  new TypeSafeClient({
    apiKey: "sample-only",
    compression: false,
    logLevel: "off",
    retry: { maxRetries: 0 },
    fetch,
  });
const input = (caseId: TwitchCase) => ({
  caseId,
  message: twitchCases[caseId].message,
});

test("original feed and questions retain the source state, message order and question semantics", () => {
  assert.equal(chat.messages.length, 29);
  // Content hash protects all 29 source messages and stream context, independent of JSON formatting.
  assert.equal(
    createHash("sha256").update(JSON.stringify(chat)).digest("hex"),
    "6bfbd1a1c86ecb28672d4a04b9313e983b6f080f94a977706245ca608f9a39bd",
  );
  assert.equal(
    questions.category.instructions,
    "Which category best describes the main purpose of `message.text`?",
  );
  assert.deepEqual(Object.keys(questions.category.criteria), [
    "question",
    "hype",
    "conversation",
    "backseat",
    "spam",
  ]);
  assert.equal(
    questions.category.criteria.hype,
    "Cheering, reactions, or repeated emotes (PogChamp, LUL, GG, W, lets gooo); repetition alone does not make cheering spam",
  );
  assert.deepEqual(questions.toxic.criteria, {
    true: "Insults, slurs, threats or personal attacks on the streamer or another viewer",
    false: "Friendly, neutral, or light banter with no target",
  });
  assert.equal(
    questions.spoiler.instructions,
    "Does this message reveal a plot point or ending of the game being played?",
  );
});

test("public flow executes 29 three-question requests with concurrency eight and ordered results despite out-of-order completion", async () => {
  const requests: ReturnType<typeof messageRequest>[] = [];
  const completed: number[] = [];
  const sample = twitchSampleTransport("original", 0);
  let active = 0,
    peak = 0,
    release!: () => void;
  const firstGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let captured: FlowRun | undefined;
  const client = clientFor(async (url, init) => {
    const index = requests.length;
    requests.push(JSON.parse(String(init?.body)));
    peak = Math.max(peak, ++active);
    try {
      if (index === 0) await firstGate;
      const response = await sample(url, init);
      completed.push(index);
      return response;
    } finally {
      active--;
      if (index === 7) release();
    }
  });
  const result = await twitchFlow.run(input("original"), {
    client,
    devtools: {
      startFlow: () => ({
        update: (run) => {
          captured = run;
        },
        request: (_link, _trace, cb) => cb(),
      }),
    },
  });
  const value = result.value as TwitchResult;
  assert.equal(peak, 8);
  assert.equal(requests.length, 29);
  assert.notDeepEqual(
    completed,
    Array.from({ length: 29 }, (_, i) => i),
  );
  assert.deepEqual(
    requests.map((r) => r.state.message),
    chat.messages,
  );
  assert.deepEqual(
    value.rows.map((r) => r.message),
    chat.messages,
  );
  for (const request of requests) {
    assert.equal(request.model, "jev-1.13.0");
    assert.deepEqual(request.state.stream, stream);
    assert.deepEqual(request.questions, JSON.parse(JSON.stringify(questions)));
    assert.deepEqual(Object.keys(request.questions), [
      "category",
      "toxic",
      "spoiler",
    ]);
  }
  const counts = value.rows.reduce<Record<string, number>>((counts, row) => {
    counts[row.normal.action] = (counts[row.normal.action] ?? 0) + 1;
    return counts;
  }, {});
  assert.deepEqual(counts, { show: 14, highlight: 6, hide: 7, blur: 2 });
  assert.equal(value.changed, 14);
  assert.ok(value.rows.some((r) => r.quiet.action === "dim"));
  assert.ok(value.rows.every((r) => r.classification.confidence === 0.31));
  assert.equal(captured!.status, "success");
  assert.equal(captured!.steps["classify-chat"].collection!.concurrency, 8);
  assert.equal(captured!.steps["classify-chat"].collection!.items.length, 29);
});

test("actual flow routing protects inclusive thresholds and toxic/category/spoiler precedence", async () => {
  let count = 0;
  let captured: FlowRun | undefined;
  const sample = twitchSampleTransport("boundaries", 0);
  const value = (
    await twitchFlow.run(input("boundaries"), {
      client: clientFor(async (url, init) => {
        count++;
        return sample(url, init);
      }),
      devtools: {
        startFlow: () => ({
          update: (run) => {
            captured = run;
          },
          request: (_link, _trace, cb) => cb(),
        }),
      },
    })
  ).value as TwitchResult;
  const items = captured!.steps["classify-chat"].collection!.items;
  assert.equal(items[1].run!.steps["toxic-threshold"].decision, true);
  assert.equal(items[1].run!.steps["category-hidden"].status, "untaken");
  assert.equal(items[4].run!.steps["spoiler-threshold"].decision, true);
  assert.equal(items[6].run!.steps["category-hidden"].decision, true);
  assert.equal(items[6].run!.steps["spoiler-threshold"].status, "untaken");
  assert.equal(count, 9); // Quiet reapplication adds no requests.
  assert.deepEqual(
    value.rows.map((r) => [r.normal.action, r.normal.reason]),
    [
      ["highlight", "question"],
      ["hide", "toxic"],
      ["hide", "toxic"],
      ["show", "conversation"],
      ["blur", "spoiler"],
      ["blur", "spoiler"],
      ["hide", "backseat"],
      ["show", "hype"],
      ["blur", "spoiler"],
    ],
  );
  assert.deepEqual(
    value.rows.map((r) => r.quiet.action),
    [
      "highlight",
      "hide",
      "hide",
      "dim",
      "blur",
      "blur",
      "hide",
      "hide",
      "hide",
    ],
  );
  for (const row of value.rows) {
    assert.deepEqual(row.normal, decide(row.classification));
    assert.deepEqual(row.quiet, decide(row.classification, QUIET));
  }
});

test("sample transport rejects altered state, model and questions; flow rejects unknown or edited inputs before dispatch", async () => {
  const sample = twitchSampleTransport("original", 0);
  const request = messageRequest(fixtures("original")[0].message);
  const mutations = [
    { ...request, model: "other" },
    {
      ...request,
      state: { ...request.state, stream: { ...stream, game: "other" } },
    },
    {
      ...request,
      state: { ...request.state, message: { user: "edited", text: "edited" } },
    },
    {
      ...request,
      questions: {
        ...questions,
        spoiler: { ...questions.spoiler, instructions: "edited" },
      },
    },
    { ...request, questions: { category: questions.category } },
  ];
  for (const changed of mutations)
    await assert.rejects(
      sample("https://sample.invalid", { body: JSON.stringify(changed) }),
      /does not match/,
    );
  let count = 0;
  const client = clientFor(async () => {
    count++;
    throw new Error("Unexpected dispatch");
  });
  await assert.rejects(
    twitchFlow.run({ caseId: "original", message: "edited" }, { client }),
    /No Twitch sample/,
  );
  await assert.rejects(
    twitchFlow.run(
      { caseId: "unknown" as TwitchCase, message: "edited" },
      { client },
    ),
    /No Twitch sample/,
  );
  assert.equal(count, 0);
});

test("cancellation stops the finite map before queued messages dispatch", async () => {
  const controller = new AbortController();
  let count = 0;
  const sample = twitchSampleTransport("original", 100);
  const client = clientFor(async (url, init) => {
    count++;
    if (count === 8) controller.abort();
    return sample(url, init);
  });
  await assert.rejects(
    twitchFlow.run(input("original"), { client, signal: controller.signal }),
  );
  assert.equal(count, 8);
});
