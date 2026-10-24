import { test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { TypeSafeClient, choice, noul, type Fetch } from "@typesafe-ai/sdk";
import {
  FlowLoopLimitError,
  defineJevFlow,
  replayClient,
  type FlowFixture,
  type FlowRunOptions,
} from "../flow/index.js";
import { createJevDevtools } from "../server/index.js";
import { flowFixture } from "../src/flow-fixture.js";
import type { Trace } from "../src/protocol.js";
import type { FlowDefinition, FlowRun, FlowUpdate } from "../src/flow-protocol.js";

// Compare-with-fixture gate, part 2: the 0.4.0 engine (tasks, request factories, if/merge,
// map, loop, loop containing map). Same loading pattern as compare.test.ts: the API is
// imported dynamically so each check fails on an explicit "must export" assertion until the
// export lands. compare.test.ts still holds unchanged; this file adds to its contract.
//
// Contract pinned here (established from flow/index.ts and flow-fixture.ts, not assumed):
// - Step ids. A step inside a map item or loop iteration is reported under the id its request
//   link and fixture key use: `${parentId}/${index}/${innerId}`, composed once per nesting
//   level (loop containing map: `${loopId}/${i}/${mapId}/${j}/${innerId}`). Inner ids repeat
//   across items and may equal a root id, so a bare inner id never identifies an item step.
// - Order. decisions, answers, steps.onlyRecorded and steps.onlyLive all follow one walk:
//   root definition order; at a map or loop node, its items by ascending index (the union of
//   indexes either side ran), each item walked in its own definition order before the walk
//   moves to the next item, then on to the parent's next node. So for items with inner steps
//   x then y: m/0/x, m/0/y, m/1/x, m/1/y. Completion order and fixture key order never matter.
// - Decisions are the branch() and if() steps either side evaluated, at any depth. if()
//   merge nodes ("<id>-result") are not decisions (the engine copies the if's boolean onto
//   them). Loop and map nodes are not decisions: a loop's recorded boolean is its last
//   while() check, which is false after every successful run.
// - Answers and one-sided steps cover jev steps only, at any depth. Tasks are never answer
//   fields or one-sided steps; they run locally on both sides, the recorded side seeing the
//   replayed answers. A task-derived condition that flips shows up as a decision change.
// - Request factories: questions are compared by the names each side's request generated;
//   a name only one side generated reports its fields with the other side as (none).
// - changed: outcome, value or a decision differs, OR some jev step ran on only one side.
//   In 0.3.0 a one-sided step always came with a decision flip; in 0.4.0 a loop that ran a
//   different number of iterations, or a map over a different number of items, can change
//   the steps that ran with no decision, outcome or value change.
// - liveFixture equals flowFixture(definition, liveRun, traces).fixture for the live run, item
//   keys included, and replays offline to the live outcome and value.
// - formatComparison lines keep the compare.test.ts formats and order, with composed ids:
//     decision <composedId>: <then|else|(not run)> -> <then|else|(not run)>
//     step <composedId>: recorded only | live only
//     <composedId>.<question>.<field>: <recorded> -> <live>[ (<signed delta>)]
//   e.g. "decision classify/1/gate: then -> else", "step rounds/2/ask: recorded only",
//   "rounds/1/batch/0/assess.yes.noul: 0.50 -> 0.40 (-0.10)". A question name or field key
//   containing ".", "[", "]" or '"' is bracketed with JSON quoting: `probe["v1.2"].noul`.
// Stay-on checks (marked STAY-ON) already pass with the 0.3.0 module copied unchanged: the
// rejection checks guard behaviour the engine and the copied module already give 0.4.0 runs,
// and the rest pin hardening from the 0.3.0 review rounds, with goldens recorded from the
// reviewed 0.3.0 module. They must stay green through the port.
type AnswerValue = string | number | boolean | null;
type AnswerChange = {
  stepId: string;
  question: string;
  field: string;
  recorded?: AnswerValue;
  live?: AnswerValue;
  delta?: number;
  changed: boolean;
};
type Decision = { stepId: string; recorded?: boolean; live?: boolean; changed: boolean };
type FixtureComparison = {
  changed: boolean;
  outcome: { recorded: string; live: string; changed: boolean };
  value: { recorded?: unknown; live?: unknown; changed: boolean };
  decisions: Decision[];
  answers: AnswerChange[];
  steps: { onlyRecorded: string[]; onlyLive: string[] };
  liveFixture: FlowFixture;
};
type AnyFlow = {
  run(
    input: never,
    options: FlowRunOptions,
  ): Promise<{ runId: string; outcome: string; value?: unknown }>;
  definition: FlowDefinition;
};
type CompareApi = {
  compareWithFixture: (
    flow: AnyFlow,
    input: unknown,
    fixture: FlowFixture,
    options: FlowRunOptions & { tolerance?: number },
  ) => Promise<FixtureComparison>;
  formatComparison: (comparison: FixtureComparison) => string;
};
async function compareApi(): Promise<CompareApi> {
  // Cast: these exports do not exist until the feature is built; the typeof checks are the gate.
  const flow = (await import("../flow/index.js")) as unknown as Partial<CompareApi>;
  assert.equal(
    typeof flow.compareWithFixture,
    "function",
    "jev-devtools/flow must export compareWithFixture",
  );
  assert.equal(
    typeof flow.formatComparison,
    "function",
    "jev-devtools/flow must export formatComparison",
  );
  return {
    compareWithFixture: flow.compareWithFixture!,
    formatComparison: flow.formatComparison!,
  };
}

const origin = "http://localhost:5197";
const options = (fetch: Fetch) => ({
  apiKey: "sample-only",
  fetch,
  logLevel: "off" as const,
  retry: { maxRetries: 0 },
});
const liveClient = (fetch: Fetch) => new TypeSafeClient(options(fetch));
/** JSON-normal form: drops undefined keys and rounds float noise so deltas compare exactly. */
const norm = (value: unknown): unknown =>
  JSON.parse(
    JSON.stringify(value, (_key, v) =>
      typeof v === "number" ? Math.round(v * 1e9) / 1e9 : v,
    ),
  );
const noulBody = (answers: Record<string, number>) => ({
  model: "sample",
  answers: Object.fromEntries(
    Object.entries(answers).map(([name, value]) => [name, { type: "noul", noul: value }]),
  ),
});
type State = Record<string, unknown>;
/** JSON transport: answers from the request state and question names, never from a fixture. */
function transport(
  answer: (state: State, questions: string[]) => unknown,
  wait: (state: State) => number = () => 0,
  done: State[] = [],
): Fetch {
  return async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    const ms = wait(body.state);
    if (ms) await delay(ms);
    done.push(body.state);
    return Response.json(answer(body.state, Object.keys(body.questions)));
  };
}
const noulChange = (
  stepId: string,
  question: string,
  recorded: number,
  live: number,
  changed: boolean,
): AnswerChange => ({ stepId, question, field: "noul", recorded, live, delta: live - recorded, changed });
const decision = (stepId: string, recorded: boolean | undefined, live: boolean | undefined): Decision => ({
  stepId,
  ...(recorded !== undefined ? { recorded } : {}),
  ...(live !== undefined ? { live } : {}),
  changed: recorded !== live,
});
async function history(inspector: ReturnType<typeof createJevDevtools>, path = "/flows/events") {
  const response = await inspector.handle(new Request(origin + "/api/jev-devtools" + path));
  assert.equal(response.status, 200);
  const reader = response.body!.getReader();
  const first = await reader.read();
  await reader.cancel();
  return JSON.parse(new TextDecoder().decode(first.value).split("data: ")[1].trim());
}
/** No network: global fetch counts and throws; TYPESAFE_API_KEY is unset. */
async function offline<T>(body: () => Promise<T>): Promise<{ result: T; network: number }> {
  const realFetch = globalThis.fetch;
  const key = process.env.TYPESAFE_API_KEY;
  let network = 0;
  globalThis.fetch = (async () => {
    network++;
    throw new Error("network forbidden for the recorded side");
  }) as typeof fetch;
  delete process.env.TYPESAFE_API_KEY;
  try {
    return { result: await body(), network };
  } finally {
    globalThis.fetch = realFetch;
    if (key !== undefined) process.env.TYPESAFE_API_KEY = key;
  }
}
const rejection = (pending: Promise<unknown>) =>
  pending.then(
    () => assert.fail("expected a rejection"),
    (e: unknown) => e,
  );

// ---- Flows under test -------------------------------------------------------------
/**
 * Root jev, a map whose items each run a jev then two if()s (one arm a jev, the others tasks),
 * then a root jev whose id equals the inner jev id.
 */
function passagesFlow() {
  return defineJevFlow<{ passages: string[] }>("passages", (f) => {
    const plan = f.jev("plan", { state: { step: "plan" }, questions: { go: noul("Go?") } });
    const kept = f.map(
      "classify",
      { items: f.input.get("passages"), input: { go: plan.answer("go").noul }, concurrency: 3, maxItems: 8 },
      (item) => {
        const assess = item.jev("assess", {
          state: { step: "assess", text: item.input.get("item") },
          questions: { relevant: noul("Relevant?") },
        });
        const relevant = assess.answer("relevant").noul;
        const score = item.if("gate", {
          when: relevant.gte(0.5),
          then: (p) =>
            p.jev("detail", {
              state: { step: "detail", text: item.input.get("item") },
              questions: { score: noul("Score?") },
            }).answer("score").noul,
          else: (p) => p.task("skip", { input: null, run: () => 0 }),
        });
        item.if("tone", {
          when: relevant.gt(0.9),
          then: (p) => p.task("strong", { input: null, run: () => "strong" }),
          else: (p) => p.task("plain", { input: null, run: () => "plain" }),
        });
        return score;
      },
    );
    // Same id as the item's first step on purpose.
    const total = f.jev("assess", { state: { step: "total" }, questions: { ok: noul("OK?") } });
    return f.output("done", { kept, ok: total.answer("ok").noul });
  });
}
const passagesFixture = (): FlowFixture => ({
  version: 1,
  flow: "passages",
  steps: {
    // Reverse of walk order on purpose.
    assess: noulBody({ ok: 0.5 }),
    "classify/2/assess": noulBody({ relevant: 0.2 }),
    "classify/1/detail": noulBody({ score: 0.6 }),
    "classify/1/assess": noulBody({ relevant: 0.95 }),
    "classify/0/detail": noulBody({ score: 0.6 }),
    "classify/0/assess": noulBody({ relevant: 0.7 }),
    plan: noulBody({ go: 0.9 }),
  },
});
const passagesLiveRelevant: Record<string, number> = { a: 0.7, b: 0.3, c: 0.95 };
const passagesLiveScore: Record<string, number> = { a: 0.64, c: 0.6 };
/** Live: item a's assess answers last and item c's first, so completion order is c, b, a. */
const passagesLive = (done: State[] = []) =>
  transport(
    (s) =>
      s.step === "plan"
        ? noulBody({ go: 0.9 })
        : s.step === "total"
          ? noulBody({ ok: 0.5 })
          : s.step === "assess"
            ? noulBody({ relevant: passagesLiveRelevant[s.text as string] })
            : noulBody({ score: passagesLiveScore[s.text as string] }),
    (s) => (s.step === "assess" ? ({ a: 40, b: 20, c: 0 } as Record<string, number>)[s.text as string] : 0),
    done,
  );
const passagesInput = { passages: ["a", "b", "c"] };

/** Loop whose iteration count follows the answers (total < 0.8), with an if() per iteration. */
function refineFlow(boost = true, report = true) {
  return defineJevFlow<null>("refine", (f) => {
    const final = f.loop(
      "rounds",
      { initial: { n: 0, total: 0 }, input: null, while: (s) => s.get("total").lt(0.8), maxIterations: 5 },
      (it) => {
        const gain = it.jev("ask", {
          state: { step: "ask", n: it.input.get("state").get("n") },
          questions: { gain: noul("Gain?") },
        }).answer("gain").noul;
        if (boost)
          it.if("boost", {
            when: gain.gte(0.5),
            then: (p) =>
              p.jev("check", {
                state: { step: "check", n: it.input.get("state").get("n") },
                questions: { ok: noul("OK?") },
              }).answer("ok").noul,
            else: () => gain,
          });
        return it.task("next", {
          input: { s: it.input.get("state"), g: gain },
          run: ({ s, g }) => ({ n: s.n + 1, total: s.total + g }),
        });
      },
    );
    return report ? f.output("done", final) : f.output("done");
  });
}
/** Recorded iterations: one ask per gain, and a check where gain >= 0.5 (with boost). */
const refineFixture = (gains: number[], boost = true): FlowFixture => ({
  version: 1,
  flow: "refine",
  steps: Object.fromEntries(
    gains.flatMap((gain, i) => [
      [`rounds/${i}/ask`, noulBody({ gain })],
      ...(boost && gain >= 0.5 ? [[`rounds/${i}/check`, noulBody({ ok: 0.9 })]] : []),
    ]),
  ),
});
const refineLive = (gains: number[]) =>
  transport((s) => (s.step === "ask" ? noulBody({ gain: gains[s.n as number] }) : noulBody({ ok: 0.9 })));

/** Loop containing a map whose items run a jev and an if(): two iterations of two items. */
function sweepFlow() {
  return defineJevFlow<{ items: string[] }>("sweep", (f) => {
    const final = f.loop(
      "rounds",
      { initial: { n: 0, kept: 0 }, input: { items: f.input.get("items") }, while: (s) => s.get("n").lt(2), maxIterations: 3 },
      (it) => {
        const flags = it.map(
          "batch",
          {
            items: it.input.get("context").get("items"),
            input: { n: it.input.get("state").get("n") },
            concurrency: 2,
            maxItems: 4,
          },
          (item) => {
            const yes = item.jev("assess", {
              state: { step: "sweep", n: item.input.get("context").get("n"), item: item.input.get("item") },
              questions: { yes: noul("Yes?") },
            }).answer("yes").noul;
            return item.if("keep", {
              when: yes.gte(0.5),
              then: (p) => p.task("one", { input: null, run: () => 1 }),
              else: (p) => p.task("zero", { input: null, run: () => 0 }),
            });
          },
        );
        return it.task("next", {
          input: { s: it.input.get("state"), flags },
          run: ({ s, flags }) => ({ n: s.n + 1, kept: s.kept + flags.reduce((a, b) => a + b, 0) }),
        });
      },
    );
    return f.output("done", final);
  });
}
const sweepRecorded: Record<string, number> = { "0:p": 0.25, "0:q": 0.75, "1:p": 0.5, "1:q": 0.2 };
const sweepLiveAnswers: Record<string, number> = { "0:p": 0.25, "0:q": 0.75, "1:p": 0.4, "1:q": 0.6 };
const sweepFixture = (): FlowFixture => ({
  version: 1,
  flow: "sweep",
  steps: Object.fromEntries(
    Object.entries(sweepRecorded).map(([key, yes]) => {
      const [n, item] = key.split(":");
      return [`rounds/${n}/batch/${item === "p" ? 0 : 1}/assess`, noulBody({ yes })];
    }),
  ),
});
/** Live: item p answers after item q in every iteration. */
const sweepLive = () =>
  transport(
    (s) => noulBody({ yes: sweepLiveAnswers[`${s.n}:${s.item}`] }),
    (s) => (s.item === "p" ? 20 : 0),
  );

/** A task computes the if() condition from two answers; a terminal branch follows the merge. */
function triagedFlow(seen: unknown[]) {
  return defineJevFlow<{ text: string }>("triaged", (f) => {
    const triage = f.jev("triage", {
      state: { step: "triage" },
      questions: { urgent: noul("Urgent?"), spam: noul("Spam?") },
    });
    const risk = f.task("risk", {
      input: { u: triage.answer("urgent").noul, s: triage.answer("spam").noul },
      run: ({ u, s }) => {
        seen.push({ u, s });
        return { score: u - s, flagged: u - s > 0.3 };
      },
    });
    const level = f.if("urgency", {
      when: risk.get("flagged").eq(true),
      then: (p) => p.jev("escalate", { state: { step: "escalate" }, questions: { level: noul("Level?") } }).answer("level").noul,
      else: (p) => p.task("calm", { input: null, run: () => 0 }),
    });
    const summary = f.jev("summarize", { state: { step: "summarize", level }, questions: { done: noul("Done?") } });
    return f.branch("final", {
      when: summary.answer("done").noul.gte(0.5),
      then: (p) => p.output("closed"),
      else: (p) => p.output("open"),
    });
  });
}

/** Runtime question names: a root factory driven by an answer, and a factory inside map items. */
function dynamicFlow() {
  return defineJevFlow<{ labels: string[] }>("dynamic", (f) => {
    const triage = f.jev("triage", {
      state: { step: "triage" },
      questions: { category: choice("Category?", { refund: null, billing: null }) },
    });
    f.jev("probe", {
      input: { topic: triage.answer("category").choice },
      request: ({ topic }) => ({
        state: { step: "probe", topic },
        questions: { [`fits.${topic}`]: noul("Fits?"), "v1.2": noul("Version?") },
      }),
    });
    f.map("labels", { items: f.input.get("labels"), input: null, concurrency: 2, maxItems: 4 }, (item) =>
      item.jev("rate", {
        input: { label: item.input.get("item") },
        request: ({ label }) => ({
          state: { step: "rate", label },
          questions: { [`is.${label}`]: noul("Is it?") },
        }),
      }).answers,
    );
    return f.output("done");
  });
}
const categoryBody = (category: string, refund: number, billing: number) => ({
  model: "sample",
  answers: { category: { type: "choice", choice: category, confidence: 0.6, probabilities: { refund, billing } } },
});

// ---- 1. Map items ------------------------------------------------------------------------
test("map items: decisions, answers and one-sided steps use composed ids, item by item in index order", async () => {
  const api = await compareApi();
  const done: State[] = [];
  const comparison = await api.compareWithFixture(passagesFlow(), passagesInput, passagesFixture(), {
    client: liveClient(passagesLive(done)),
  });
  assert.deepEqual(
    done.filter((s) => s.step === "assess").map((s) => s.text),
    ["c", "b", "a"],
    "premise: live items completed in reverse index order",
  );
  const { liveFixture: _, ...rest } = comparison;
  assert.deepEqual(norm(rest), norm({
    changed: true,
    outcome: { recorded: "done", live: "done", changed: false },
    value: {
      recorded: { kept: [0.6, 0.6, 0], ok: 0.5 },
      live: { kept: [0.64, 0, 0.6], ok: 0.5 },
      changed: true,
    },
    decisions: [
      decision("classify/0/gate", true, true),
      decision("classify/0/tone", false, false),
      decision("classify/1/gate", true, false),
      decision("classify/1/tone", true, false),
      decision("classify/2/gate", false, true),
      decision("classify/2/tone", false, true),
    ],
    answers: [
      noulChange("plan", "go", 0.9, 0.9, false),
      noulChange("classify/0/assess", "relevant", 0.7, 0.7, false),
      noulChange("classify/0/detail", "score", 0.6, 0.64, true),
      noulChange("classify/1/assess", "relevant", 0.95, 0.3, true),
      noulChange("classify/2/assess", "relevant", 0.2, 0.95, true),
      noulChange("assess", "ok", 0.5, 0.5, false),
    ],
    steps: { onlyRecorded: ["classify/1/detail"], onlyLive: ["classify/2/detail"] },
  }));
  assert.equal(api.formatComparison(comparison), [
    'value: {"kept":[0.6,0.6,0],"ok":0.5} -> {"kept":[0.64,0,0.6],"ok":0.5}',
    "decision classify/1/gate: then -> else",
    "decision classify/1/tone: then -> else",
    "decision classify/2/gate: else -> then",
    "decision classify/2/tone: else -> then",
    "step classify/1/detail: recorded only",
    "step classify/2/detail: live only",
    "classify/0/detail.score.noul: 0.60 -> 0.64 (+0.04)",
    "classify/1/assess.relevant.noul: 0.95 -> 0.30 (-0.65)",
    "classify/2/assess.relevant.noul: 0.20 -> 0.95 (+0.75)",
  ].join("\n"));
});

test("identical map items: every item decision listed unchanged, no merge or map node, no changes", async () => {
  const api = await compareApi();
  const comparison = await api.compareWithFixture(passagesFlow(), passagesInput, passagesFixture(), {
    client: liveClient(
      transport((s) =>
        s.step === "plan"
          ? noulBody({ go: 0.9 })
          : s.step === "total"
            ? noulBody({ ok: 0.5 })
            : s.step === "assess"
              ? noulBody({ relevant: ({ a: 0.7, b: 0.95, c: 0.2 } as Record<string, number>)[s.text as string] })
              : noulBody({ score: 0.6 }),
      ),
    ),
  });
  assert.deepEqual(norm(comparison.decisions), norm([
    decision("classify/0/gate", true, true),
    decision("classify/0/tone", false, false),
    decision("classify/1/gate", true, true),
    decision("classify/1/tone", true, true),
    decision("classify/2/gate", false, false),
    decision("classify/2/tone", false, false),
  ]));
  assert.deepEqual(
    comparison.answers.map((a) => a.stepId),
    ["plan", "classify/0/assess", "classify/0/detail", "classify/1/assess", "classify/1/detail", "classify/2/assess", "assess"],
  );
  assert.deepEqual(comparison.steps, { onlyRecorded: [], onlyLive: [] });
  assert.equal(comparison.changed, false);
  assert.equal(api.formatComparison(comparison), "no changes from fixture");
});

test("STAY-ON: a fixture missing a map item rejects with the replay error naming the composed id", async () => {
  const api = await compareApi();
  const fixture = passagesFixture();
  delete fixture.steps["classify/2/assess"];
  const replayError = await passagesFlow()
    .run(passagesInput, { client: replayClient(fixture) })
    .then(() => "resolved", (e: Error) => e.message);
  assert.match(replayError, /"classify\/2\/assess"/, "premise: replay alone names the composed id");
  const caught = (await rejection(
    api.compareWithFixture(passagesFlow(), passagesInput, fixture, { client: liveClient(passagesLive()) }),
  )) as Error;
  assert.ok(
    caught.message.includes(replayError),
    `rejection must include the replay error ${JSON.stringify(replayError)}, got ${JSON.stringify(caught.message)}`,
  );
});

// ---- 2. Loop iterations ------------------------------------------------------------------
test("a loop that ran fewer iterations live: per-iteration decisions and one-sided steps by iteration", async () => {
  const api = await compareApi();
  const comparison = await api.compareWithFixture(refineFlow(), null, refineFixture([0.25, 0.5, 0.125]), {
    client: liveClient(refineLive([0.5, 0.5])),
  });
  const { liveFixture: _, ...rest } = comparison;
  assert.deepEqual(norm(rest), norm({
    changed: true,
    outcome: { recorded: "done", live: "done", changed: false },
    value: { recorded: { n: 3, total: 0.875 }, live: { n: 2, total: 1 }, changed: true },
    decisions: [
      decision("rounds/0/boost", false, true),
      decision("rounds/1/boost", true, true),
      decision("rounds/2/boost", false, undefined),
    ],
    answers: [
      noulChange("rounds/0/ask", "gain", 0.25, 0.5, true),
      noulChange("rounds/1/ask", "gain", 0.5, 0.5, false),
      noulChange("rounds/1/check", "ok", 0.9, 0.9, false),
    ],
    steps: { onlyRecorded: ["rounds/2/ask"], onlyLive: ["rounds/0/check"] },
  }));
  assert.equal(api.formatComparison(comparison), [
    'value: {"n":3,"total":0.875} -> {"n":2,"total":1}',
    "decision rounds/0/boost: else -> then",
    "decision rounds/2/boost: else -> (not run)",
    "step rounds/2/ask: recorded only",
    "step rounds/0/check: live only",
    "rounds/0/ask.gain.noul: 0.25 -> 0.50 (+0.25)",
  ].join("\n"));
});

test("a loop that ran more iterations live reports the extra iteration as live only", async () => {
  const api = await compareApi();
  const comparison = await api.compareWithFixture(refineFlow(), null, refineFixture([0.5, 0.5]), {
    client: liveClient(refineLive([0.25, 0.5, 0.125])),
  });
  assert.deepEqual(norm(comparison.decisions), norm([
    decision("rounds/0/boost", true, false),
    decision("rounds/1/boost", true, true),
    decision("rounds/2/boost", undefined, false),
  ]));
  assert.deepEqual(comparison.steps, { onlyRecorded: ["rounds/0/check"], onlyLive: ["rounds/2/ask"] });
  assert.equal(api.formatComparison(comparison), [
    'value: {"n":2,"total":1} -> {"n":3,"total":0.875}',
    "decision rounds/0/boost: then -> else",
    "decision rounds/2/boost: (not run) -> else",
    "step rounds/0/check: recorded only",
    "step rounds/2/ask: live only",
    "rounds/0/ask.gain.noul: 0.50 -> 0.25 (-0.25)",
  ].join("\n"));
});

test("a different loop iteration count or map item count sets changed with no decision, outcome or value change", async () => {
  const api = await compareApi();
  const loop = await api.compareWithFixture(refineFlow(false, false), null, refineFixture([0.25, 0.5, 0.125], false), {
    client: liveClient(refineLive([0.25, 0.75])),
    tolerance: 0.3,
  });
  assert.deepEqual(
    norm([loop.outcome, loop.value, loop.decisions, loop.answers.some((a) => a.changed)]),
    [{ recorded: "done", live: "done", changed: false }, { changed: false }, [], false],
    "premise: same outcome, no value, no decisions, drift within tolerance",
  );
  assert.deepEqual(loop.steps, { onlyRecorded: ["rounds/2/ask"], onlyLive: [] });
  assert.equal(loop.changed, true, "an iteration that ran on one side changes the run");
  assert.equal(api.formatComparison(loop), "step rounds/2/ask: recorded only");

  // Map items come from a task over the answer's probabilities: 2 recorded, 3 live.
  const shortlist = () =>
    defineJevFlow<null>("shortlist", (f) => {
      const rank = f.jev("rank", { state: { step: "rank" }, questions: { pick: choice("Pick?", { x: null, y: null, z: null }) } });
      const picked = f.task("filter", {
        input: rank.answer("pick").probabilities,
        run: (p) => Object.entries(p).filter(([, v]) => v >= 0.3).map(([k]) => k),
      });
      f.map("labels", { items: picked, input: null, concurrency: 1, maxItems: 4 }, (item) =>
        item.jev("rate", { state: { step: "rate", label: item.input.get("item") }, questions: { ok: noul("OK?") } }).answer("ok").noul,
      );
      return f.output("done");
    });
  const rankBody = (x: number, y: number, z: number) => ({
    model: "sample",
    answers: { pick: { type: "choice", choice: "x", confidence: x, probabilities: { x, y, z } } },
  });
  const map = await api.compareWithFixture(
    shortlist(),
    null,
    {
      version: 1,
      flow: "shortlist",
      steps: { rank: rankBody(0.5, 0.4, 0.1), "labels/0/rate": noulBody({ ok: 0.5 }), "labels/1/rate": noulBody({ ok: 0.5 }) },
    },
    {
      client: liveClient(transport((s) => (s.step === "rank" ? rankBody(0.4, 0.3, 0.3) : noulBody({ ok: 0.5 })))),
      tolerance: 0.25,
    },
  );
  assert.deepEqual(
    norm([map.outcome.changed, map.value, map.decisions, map.answers.some((a) => a.changed)]),
    [false, { changed: false }, [], false],
    "premise: same outcome, no value, no decisions, drift within tolerance",
  );
  assert.deepEqual(map.answers.map((a) => a.stepId), ["rank", "rank", "rank", "rank", "rank", "labels/0/rate", "labels/1/rate"]);
  assert.deepEqual(map.steps, { onlyRecorded: [], onlyLive: ["labels/2/rate"] });
  assert.equal(map.changed, true, "a map item that ran on one side changes the run");
  assert.equal(api.formatComparison(map), "step labels/2/rate: live only");
});

// ---- 3. Loop containing a map ---------------------------------------------------------------
test("a loop containing a map composes ids per level: rounds/<i>/batch/<j>/<inner>", async () => {
  const api = await compareApi();
  const comparison = await api.compareWithFixture(sweepFlow(), { items: ["p", "q"] }, sweepFixture(), {
    client: liveClient(sweepLive()),
  });
  const { liveFixture: _, ...rest } = comparison;
  assert.deepEqual(norm(rest), norm({
    changed: true,
    outcome: { recorded: "done", live: "done", changed: false },
    value: { recorded: { n: 2, kept: 2 }, live: { n: 2, kept: 2 }, changed: false },
    decisions: [
      decision("rounds/0/batch/0/keep", false, false),
      decision("rounds/0/batch/1/keep", true, true),
      decision("rounds/1/batch/0/keep", true, false),
      decision("rounds/1/batch/1/keep", false, true),
    ],
    answers: [
      noulChange("rounds/0/batch/0/assess", "yes", 0.25, 0.25, false),
      noulChange("rounds/0/batch/1/assess", "yes", 0.75, 0.75, false),
      noulChange("rounds/1/batch/0/assess", "yes", 0.5, 0.4, true),
      noulChange("rounds/1/batch/1/assess", "yes", 0.2, 0.6, true),
    ],
    steps: { onlyRecorded: [], onlyLive: [] },
  }));
  assert.equal(api.formatComparison(comparison), [
    "decision rounds/1/batch/0/keep: then -> else",
    "decision rounds/1/batch/1/keep: else -> then",
    "rounds/1/batch/0/assess.yes.noul: 0.50 -> 0.40 (-0.10)",
    "rounds/1/batch/1/assess.yes.noul: 0.20 -> 0.60 (+0.40)",
  ].join("\n"));
});

// ---- 4. if() and merges, tasks --------------------------------------------------------------
test("a task-derived if() flip is a decision change; merges, tasks and task outputs are never reported", async () => {
  const api = await compareApi();
  const seen: unknown[] = [];
  const fixture: FlowFixture = {
    version: 1,
    flow: "triaged",
    steps: {
      triage: noulBody({ urgent: 0.6, spam: 0.2 }),
      escalate: noulBody({ level: 0.8 }),
      summarize: noulBody({ done: 0.7 }),
    },
  };
  const live = transport((s) =>
    s.step === "triage" ? noulBody({ urgent: 0.5, spam: 0.3 }) : s.step === "escalate" ? noulBody({ level: 0.8 }) : noulBody({ done: 0.7 }),
  );
  const comparison = await api.compareWithFixture(triagedFlow(seen), { text: "t" }, fixture, {
    client: liveClient(live),
    tolerance: 0.2,
  });
  assert.deepEqual(
    norm([...seen].sort((a, b) => (a as { u: number }).u - (b as { u: number }).u)),
    [{ u: 0.5, s: 0.3 }, { u: 0.6, s: 0.2 }],
    "the task ran once per side, each with that side's answers",
  );
  const { liveFixture, ...rest } = comparison;
  assert.deepEqual(norm(rest), norm({
    changed: true,
    outcome: { recorded: "closed", live: "closed", changed: false },
    value: { changed: false },
    decisions: [decision("urgency", true, false), decision("final", true, true)],
    answers: [
      noulChange("triage", "urgent", 0.6, 0.5, false),
      noulChange("triage", "spam", 0.2, 0.3, false),
      noulChange("summarize", "done", 0.7, 0.7, false),
    ],
    steps: { onlyRecorded: ["escalate"], onlyLive: [] },
  }));
  assert.deepEqual(
    norm(liveFixture),
    { version: 1, flow: "triaged", steps: { triage: noulBody({ urgent: 0.5, spam: 0.3 }), summarize: noulBody({ done: 0.7 }) } },
    "tasks and merges are not fixture entries",
  );
  assert.equal(api.formatComparison(comparison), ["decision urgency: then -> else", "step escalate: recorded only"].join("\n"));
});

// ---- 5. Request factories ---------------------------------------------------------------------
test("request factories: answers are compared by each side's generated question names, at root and in items", async () => {
  const api = await compareApi();
  const fixture: FlowFixture = {
    version: 1,
    flow: "dynamic",
    steps: {
      triage: categoryBody("refund", 0.6, 0.4),
      probe: noulBody({ "fits.refund": 0.6, "v1.2": 0.4 }),
      "labels/0/rate": noulBody({ "is.x": 0.3 }),
      "labels/1/rate": noulBody({ "is.y": 0.5 }),
    },
  };
  const asked: string[][] = [];
  const live = transport((s, questions) => {
    asked.push(questions);
    if (s.step === "triage") return categoryBody("billing", 0.4, 0.6);
    if (s.step === "probe") return noulBody({ [`fits.${s.topic}`]: 0.7, "v1.2": 0.45 });
    return noulBody({ [`is.${s.label}`]: s.label === "x" ? 0.3 : 0.55 });
  });
  const comparison = await api.compareWithFixture(dynamicFlow(), { labels: ["x", "y"] }, fixture, {
    client: liveClient(live),
  });
  assert.ok(
    asked.some((q) => q.join() === "fits.billing,v1.2"),
    `premise: the live factory generated its own names, got ${JSON.stringify(asked)}`,
  );
  assert.deepEqual(norm(comparison.answers), norm([
    { stepId: "triage", question: "category", field: "choice", recorded: "refund", live: "billing", changed: true },
    { stepId: "triage", question: "category", field: "confidence", recorded: 0.6, live: 0.6, delta: 0, changed: false },
    { stepId: "triage", question: "category", field: "probabilities.refund", recorded: 0.6, live: 0.4, delta: -0.2, changed: true },
    { stepId: "triage", question: "category", field: "probabilities.billing", recorded: 0.4, live: 0.6, delta: 0.2, changed: true },
    { stepId: "probe", question: "fits.refund", field: "noul", recorded: 0.6, changed: true },
    noulChange("probe", "v1.2", 0.4, 0.45, true),
    { stepId: "probe", question: "fits.billing", field: "noul", live: 0.7, changed: true },
    noulChange("labels/0/rate", "is.x", 0.3, 0.3, false),
    noulChange("labels/1/rate", "is.y", 0.5, 0.55, true),
  ]));
  assert.deepEqual(norm([comparison.decisions, comparison.steps, comparison.changed]), [
    [],
    { onlyRecorded: [], onlyLive: [] },
    false,
  ]);
  assert.equal(api.formatComparison(comparison), [
    "triage.category.choice: refund -> billing",
    "triage.category.probabilities.refund: 0.60 -> 0.40 (-0.20)",
    "triage.category.probabilities.billing: 0.40 -> 0.60 (+0.20)",
    'probe["fits.refund"].noul: 0.60 -> (none)',
    'probe["v1.2"].noul: 0.40 -> 0.45 (+0.05)',
    'probe["fits.billing"].noul: (none) -> 0.70',
    'labels/1/rate["is.y"].noul: 0.50 -> 0.55 (+0.05)',
  ].join("\n"));
});

// ---- 6. liveFixture for map and loop flows ------------------------------------------------------
for (const [label, make, input, fixture, client, golden] of [
  [
    "map with if()",
    passagesFlow,
    passagesInput,
    passagesFixture,
    passagesLive,
    {
      plan: noulBody({ go: 0.9 }),
      "classify/0/assess": noulBody({ relevant: 0.7 }),
      "classify/0/detail": noulBody({ score: 0.64 }),
      "classify/1/assess": noulBody({ relevant: 0.3 }),
      "classify/2/assess": noulBody({ relevant: 0.95 }),
      "classify/2/detail": noulBody({ score: 0.6 }),
      assess: noulBody({ ok: 0.5 }),
    },
  ],
  [
    "loop containing a map",
    sweepFlow,
    { items: ["p", "q"] },
    sweepFixture,
    sweepLive,
    {
      "rounds/0/batch/0/assess": noulBody({ yes: 0.25 }),
      "rounds/0/batch/1/assess": noulBody({ yes: 0.75 }),
      "rounds/1/batch/0/assess": noulBody({ yes: 0.4 }),
      "rounds/1/batch/1/assess": noulBody({ yes: 0.6 }),
    },
  ],
] as const) {
  test(`liveFixture (${label}) equals flowFixture of the live run, links every item trace and replays offline`, async () => {
    const api = await compareApi();
    const inspector = createJevDevtools({ origin, enabled: true });
    try {
      const flow = (make as () => AnyFlow)();
      const comparison = await api.compareWithFixture(flow, input, fixture(), {
        client: inspector.createClient(options(client()), { source: "sample" }),
        devtools: inspector,
      });
      await delay(10); // Trace results are captured from a response clone after the step resolves.
      const flows = (await history(inspector)) as FlowUpdate;
      assert.equal(flows.upserts.length, 1, "exactly one run recorded, the live one");
      const run = flows.upserts[0] as FlowRun;
      const traces = (await history(inspector, "/events")).traces as Trace[];
      const definition = flows.definitions.find((d) => d.id === run.definitionId)!;
      const built = flowFixture(definition, run, new Map(traces.map((t) => [t.id, t])));
      assert.deepEqual(built.missing, [], "premise: capture complete");
      assert.deepEqual(norm(comparison.liveFixture), norm(built.fixture), "liveFixture equals flowFixture");
      assert.deepEqual(norm(comparison.liveFixture), norm({ version: 1, flow: flow.definition.name, steps: golden }));
      assert.deepEqual(
        traces.map((t) => [t.flow?.runId === run.id, t.flow?.stepId]).sort(),
        Object.keys(golden).map((id) => [true, id]).sort(),
        "the live run's item requests reached devtools linked under their composed ids",
      );
      const saved = JSON.parse(JSON.stringify(comparison.liveFixture)) as FlowFixture;
      const { result, network } = await offline(() =>
        (make as () => AnyFlow)().run(input as never, { client: replayClient(saved) }),
      );
      assert.deepEqual(
        norm({ outcome: result.outcome, value: result.value }),
        norm({ outcome: comparison.outcome.live, value: comparison.value.live }),
        "liveFixture replays to the live outcome and value",
      );
      assert.equal(network, 0);
    } finally {
      inspector.dispose();
    }
  });
}

// ---- 7. Rejections from 0.4.0 runs ---------------------------------------------------------------
test("STAY-ON: a live loop that hits maxIterations rejects with its own FlowLoopLimitError", async () => {
  const api = await compareApi();
  const caught = await rejection(
    api.compareWithFixture(refineFlow(false), null, refineFixture([0.25, 0.5, 0.125], false), {
      client: liveClient(refineLive([0, 0, 0, 0, 0, 0])),
    }),
  );
  assert.ok(caught instanceof FlowLoopLimitError, `expected FlowLoopLimitError, got ${String(caught)}`);
});

// ---- 8. STAY-ON: hardening from the 0.3.0 review rounds ---------------------------------------
test("STAY-ON: value lines render BigInt and cycles; answer paths bracket dotted question and label names", async () => {
  const api = await compareApi();
  const pickFlow = () =>
    defineJevFlow<{ raw: unknown }>("pick", (f) => {
      const pick = f.jev("pick", {
        state: { step: "pick" },
        questions: { "q.v": choice("Pick?", { "a.b": null, c: null }) },
      });
      return f.output("done", { raw: f.input.get("raw"), p: pick.answer("q.v").confidence });
    });
  const body = (p: number) => ({
    model: "sample",
    answers: { "q.v": { type: "choice", choice: "a.b", confidence: p, probabilities: { "a.b": p, c: 0.4 } } },
  });
  const raw: Record<string, unknown> = { n: 1n };
  raw.self = raw;
  const comparison = await api.compareWithFixture(
    pickFlow(),
    { raw },
    { version: 1, flow: "pick", steps: { pick: body(0.6) } },
    { client: liveClient(transport(() => body(0.7))) },
  );
  assert.equal(api.formatComparison(comparison), [
    'value: {"raw":{"n":1n,"self":[cycle]},"p":0.6} -> {"raw":{"n":1n,"self":[cycle]},"p":0.7}',
    'pick["q.v"].confidence: 0.60 -> 0.70 (+0.10)',
    'pick["q.v"].probabilities["a.b"]: 0.60 -> 0.70 (+0.10)',
  ].join("\n"));
});

test("STAY-ON: tolerance absorbs float noise, tiny deltas print enough digits, non-finite and overflow have no delta", async () => {
  const api = await compareApi();
  const edgesFlow = () =>
    defineJevFlow<null>("edges", (f) => {
      const e = f.jev("edges", {
        state: { step: "edges" },
        questions: { a: noul("A?"), b: noul("B?"), c: noul("C?"), d: noul("D?") },
      });
      return f.output("done", { a: e.answer("a").noul });
    });
  const fixture: FlowFixture = {
    version: 1,
    flow: "edges",
    steps: { edges: noulBody({ a: 0.3, b: 0.5, c: -1.7e308, d: 0.5 }) },
  };
  // A client that returns the body object itself, so a live answer can be non-finite.
  const client = {
    systemOne: async () => noulBody({ a: 0.4, b: 0.5000001, c: 1.7e308, d: Infinity }),
  } as unknown as FlowRunOptions["client"];
  const noisy = await api.compareWithFixture(edgesFlow(), null, fixture, { client, tolerance: 0.1 });
  assert.equal(noisy.answers.find((a) => a.question === "a")?.changed, false, "0.4 - 0.3 is within tolerance 0.1");
  const strict = await api.compareWithFixture(edgesFlow(), null, fixture, { client });
  assert.deepEqual(
    strict.answers.map(({ question, delta, changed }) => ({ question, hasDelta: delta !== undefined, changed })),
    [
      { question: "a", hasDelta: true, changed: true },
      { question: "b", hasDelta: true, changed: true },
      { question: "c", hasDelta: false, changed: true },
      { question: "d", hasDelta: false, changed: true },
    ],
  );
  assert.equal(api.formatComparison(strict), [
    'value: {"a":0.3} -> {"a":0.4}',
    "edges.a.noul: 0.30 -> 0.40 (+0.10)",
    "edges.b.noul: 0.5000000 -> 0.5000001 (+0.0000001)",
    "edges.c.noul: -1.7e+308 -> 1.7e+308",
    "edges.d.noul: 0.50 -> Infinity",
  ].join("\n"));
});

test("STAY-ON: cancellation, an invalid fixture and an invalid tolerance reject with their own errors", async () => {
  const api = await compareApi();
  let calls = 0;
  const client = liveClient(
    transport(() => {
      calls++;
      return noulBody({ ok: 0.5 });
    }),
  );
  const aborted = (await rejection(
    api.compareWithFixture(passagesFlow(), passagesInput, passagesFixture(), { client, signal: AbortSignal.abort() }),
  )) as Error;
  assert.equal(aborted.name, "AbortError");
  assert.doesNotMatch(aborted.message, /Fixture replay failed/);
  const invalid = (await rejection(
    api.compareWithFixture(passagesFlow(), passagesInput, { version: 2 } as unknown as FlowFixture, { client }),
  )) as Error;
  assert.ok(invalid instanceof TypeError, `expected TypeError, got ${String(invalid)}`);
  assert.match(invalid.message, /^Expected a version 1 flow fixture/);
  for (const tolerance of [-0.1, Number.NaN, Infinity]) {
    const bad = (await rejection(
      api.compareWithFixture(passagesFlow(), passagesInput, passagesFixture(), { client, tolerance }),
    )) as Error;
    assert.ok(bad instanceof TypeError && /tolerance/.test(bad.message), `tolerance ${tolerance}: ${String(bad)}`);
  }
  assert.equal(calls, 0, "no live call was made");
});
