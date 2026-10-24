# Build and inspect a Jev flow

For `jev-devtools` 0.3.0 and later. Read the installed package version and `lib/flow/index.d.ts` first; online `main` may describe newer APIs. Use this recipe when the user asks to connect multiple Jev requests, inspect branches, or visualize parallel checks. Adding the inspector alone does not require converting existing calls to flows.

## Plan the integration

1. Complete the existing [React/Node](react-node.md) or [Next.js](nextjs.md) setup. Reuse its shared inspector and instrumented client; do not create a second recorder for flows.
2. Identify the input shape, questions, execution order, decision thresholds, parallel dependencies, and named outcomes in the user's application. Preserve existing policies. If a threshold or action is unspecified, ask rather than inventing it.
3. Import `defineJevFlow` (and `all`, `any`, `not` when needed) from **server-only** `jev-devtools/flow`. Define the graph once at module scope and call `run()` from the existing Node handler/action. In Next.js, mark the module `server-only` and keep the executing route/segment on the Node runtime. No new client provider or root component is needed.
4. Keep business actions such as refunds, notifications, and database writes in the application after the returned outcome. A named output does not execute an action. Preserve authorization, idempotency, input validation, and error handling around those actions.

If importing question helpers as below, install `@typesafe-ai/sdk` as a direct dependency in the server workspace using its package manager. The 0.3.0 release is verified with SDK 0.7.0; preserve a compatible existing version rather than silently changing SDK semantics. The flow also accepts ordinary SDK question objects.

## Complete example: parallel checks, one decision, two outcomes

The 90% threshold here is an illustrative application policy, not a Jev default. The example's `inspector` and `jev` come from the shared server setup above.

```ts
import { noul } from '@typesafe-ai/sdk';
import { defineJevFlow } from 'jev-devtools/flow';

type Ticket = { message: string };

export const reviewFlow = defineJevFlow<Ticket>('ticket-review', (flow) => {
  const checks = flow.parallel('checks', {
    eligibility: (lane) => lane.jev('eligibility', {
      state: flow.input,
      questions: { eligible: noul('Is this ticket eligible for review?') },
    }, {
      title: 'Check eligibility',
      description: 'Evaluate whether this ticket can enter the review process.',
    }).answer('eligible').noul,
    risk: (lane) => lane.jev('risk', {
      state: flow.input,
      questions: { risky: noul('Does this ticket need extra risk review?') },
    }, {
      title: 'Check risk',
      description: 'Evaluate risk independently of eligibility.',
    }).answer('risky').noul,
  }, {
    title: 'Wait for both checks',
    description: 'Continue after eligibility and risk have both succeeded.',
  });

  const decision = flow.jev('decision', {
    state: { ticket: flow.input, eligibility: checks.eligibility, risk: checks.risk },
    questions: { ready: noul('Is this ticket ready for approval?') },
  }, {
    title: 'Assess readiness',
    description: 'Ask Jev to assess the ticket using both completed checks.',
  });

  return flow.branch('readiness', {
    when: decision.answer('ready').noul.gte(0.9),
    then: (path) => path.output('ready', {
      readiness: decision.answer('ready').noul,
    }, {
      title: 'Ready for approval',
      description: 'Return readiness to the application. No approval is executed here.',
    }),
    else: (path) => path.output('manual-review', undefined, {
      title: 'Needs manual review',
      description: 'Readiness is below the application threshold.',
    }),
  }, {
    title: 'Require at least 90% readiness',
    description: 'Use the returned readiness probability to choose a route.',
  });
});
```

Invoke from your existing server handler after validating the input:

```ts
const result = await reviewFlow.run({ message: 'I was charged twice.' }, {
  client: jev,          // Created by this same inspector.
  devtools: inspector,
  signal: request.signal, // Optional AbortSignal when the framework provides one.
});
// { runId, outcome: 'ready', value: { readiness: 0.94 } }
// Or { runId, outcome: 'manual-review', value: undefined }.
```

For custom server-derived sessions, use `await inspector.run(request, () => reviewFlow.run(input, { client: jev, devtools: inspector, signal: request.signal }))`. This ensures the run and its calls use the same session as the authorized inspector connection. Do not accept an arbitrary client-supplied session ID.

## API rules that affect generated code

| API | Contract |
| --- | --- |
| `defineJevFlow<Input>(name, build)` | Synchronous definition; no requests run while building. Return `flow.output(...)` or `flow.branch(...)`. Each `run` is independent. |
| `flow.jev(id, request, display?)` | One SDK `systemOne` call when reached. Sequential within its block. Use normal SDK questions/options/assets; references resolve in state. |
| `flow.input.get('field')` | A typed expression referencing the run input, not a value available during definition. |
| `result.answer('name')` | Typed answer fields: `.choice`, `.probabilities.get('label')`, `.confidence`, `.noul`, `.score`, `.legend`, or `.box` as supported by that question's SDK result. Select nested fields with `.get(key)`. |
| `value.eq(other)`, `.lt(number)`, `.gte(number)` | Matching scalar equality or finite numeric comparisons. Noul values are in 0–1; use `0.9`, not `90`. There is no `.gt()` or `.lte()` method. |
| `all(...)`, `any(...)`, `not(...)` | Compose Boolean expressions. Every operand evaluates; missing values are errors even in an otherwise short-circuited expression. Do not use JavaScript `if`, `&&`, or `>=` on expression objects. |
| `flow.branch(id, { when, then, else }, display?)` | Terminal in that block. Both callbacks define paths; only one executes. Each callback must return its own builder's `output` or nested `branch`. No common continuation after a branch in v1. |
| `flow.parallel(id, lanes, display?)` | Named lanes run concurrently. Each lane returns an expression. Use the resulting named references after all lanes succeed. Lane-local references cannot escape directly or cross into a sibling lane. |
| `flow.output(name, value?, display?)` | Terminal named result, optionally containing nested resolved expressions. Output names are globally unique node IDs. For metadata without a value, pass `undefined` second. |
| `definition.run(input, { client, devtools?, signal? })` | Returns `{ runId, outcome: string, value?: unknown }`. Narrow/validate values in application code; outcomes are not inferred as a discriminated union. A normal SDK client works without recording. |

Use the callback's current builder (`lane` or `path`) to add steps; do not call the outer builder inside it. References must belong to the same definition and be available on the current path. Reusing an earlier parent reference is allowed. IDs must be unique across all paths/lanes: 1–80 letters, digits, `_`, or `-`, starting with a letter or digit. Maximum 256 nodes and 16 nested blocks. Published 0.3.0 has no loops or execution callbacks; the unreleased extensions below add tasks, factories, maps, returning conditionals and loops. Use them only when present in installed declarations. Plain templates are copied when defining; treat SDK assets as immutable. Define once to avoid a new definition identity on every request; hot reload can still create a new identity.

SDK retries remain within each request; the flow adds no retries. A failed step blocks dependents and rejects the run. A failed lane aborts siblings and waits for them to settle. External cancellation propagates to SDK signals; already completed calls stay completed. Handle rejection in the app; do not retry a whole flow automatically or imply durable/resumable execution.

## Diagram context and privacy

Every builder method accepts a third `{ title, description }` argument (`FlowDisplay`). Title: 1–120 characters; description: 1–600; supplied text must be nonblank. Titles change display text, not IDs, outcomes, questions, or execution. These are static developer-authored explanations, not model reasoning.

Titles/descriptions, flow names, step IDs, lane names and outcome names are structural metadata and are **not request-redacted**. Keep them static and public-safe. Request state/answers and output values use capture limits/redaction. Rule literals also use the configured redaction callback with paths beginning `['conditions', stepId]` and ending in `'value'`; preserve the app's redaction policy. Redaction never changes execution.

The condition card separates incoming captured answers from requirements, e.g. **Ready: 94% → At least 90%**. Its result comes from the actual recorded decision, not a fresh evaluation of redacted data. Evicted/missing answers and flow-input/parallel aggregate references show **Not captured**. Do not promise that every runtime value is retained. Full technical rules appear in selected-step details: select a card, then open **Show details** in the bottom bar. This panel starts collapsed and supports vertical pointer/keyboard resizing; selection changes preserve its size.

History is bounded in process (default 50 runs, maximum 200, independently from request history). Capture and display default off; disabled recording does not disable flow execution. Keep flows server-side in production too if application behavior depends on them. This is not a persistent or distributed workflow engine, and large flow canvases are not virtualized.

## Verify without inference

Use a **separate, visibly labeled sample client** from the same inspector. Do not replace the user's live client or routes. With the `reviewFlow` above, this fixture exercises the actual SDK and flow executor:

```ts
const sampleJev = inspector.createClient({
  apiKey: 'sample-only',
  logLevel: 'off',
  fetch: async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    const answers = Object.fromEntries(Object.keys(body.questions).map((name) => [
      name, { type: 'noul', noul: name === 'risky' ? 0.1 : 0.94 },
    ]));
    return Response.json({ model: 'jev-sample', answers });
  },
}, { label: 'Flow setup verification', source: 'sample' });

const result = await reviewFlow.run({ message: 'Sample ticket' }, {
  client: sampleJev,
  devtools: inspector,
});
// Expect outcome 'ready', value.readiness 0.94, and three captured calls.
```

Run this inside the application process serving the inspector, using a temporary development-only handler or the app's existing harness. A separate CLI has separate history. Mount the same root drawer; the existing base route must forward `/flows/events` as well as `/events` and `/clear`. The Next optional catch-all already does this.

Check these observable results:

- The Flows view shows two parallel requests, their join, one downstream readiness request, a condition and two possible outcomes. Three real SDK calls use the local fixture; no inference network call occurs.
- The join waits for both lanes. The chosen output is `ready`; `manual-review` is marked untaken. Incoming readiness is 94%, the requirement is at least 90%, and each request opens its captured details.
- Change only the fixture's `ready` probability to `0.4`: the other outcome executes. Missing values must not silently become zero. Use the app's error/cancellation harness if it has one.
- App typecheck/build passes, `/flow` and `/server` stay out of client bundles, and production disables inspector endpoints/display while the application's flow still executes. Do not call live inference just to verify this.

If the flow executes but details are absent, check: `devtools` passed to `run`, `client` from that same adapter, same process/session, capture enabled, `/flows/events` forwarded, and histories not cleared/evicted. A plain SDK client can produce flow states but cannot link request details. See [verify.md](verify.md) for general endpoint checks.

Remove temporary verification routes unless requested as a demo. Report the installed version, integration location, outcomes observed, whether browser checks were performed, and that responses were samples. Never equate sample verification with live-model correctness.

## Unreleased function-step experiment

Only use this section when the installed declarations actually include `task` and the request-factory overload. These APIs are not in npm 0.3.0. Do not copy them into a 0.3.0 consumer.

- `flow.task(id, { input, run, timeoutMs? }, display?)`: resolve nested input references, run server code, and return a typed reference. `run(input, { signal, runId, stepId, executionId })` may return a value or Promise. Inputs/outputs must be plain JSON-compatible values; return null rather than undefined. No implicit retry.
- `flow.jev(id, { input, request: resolved => ({ state, questions, ...sdkOptions }) }, display?)`: construct a synchronous SDK request at execution time. Do asynchronous work in a preceding task. Keep Jev calls here to retain full linked diagrams. Never return unresolved flow references or a Promise from the factory.
- Every Jev step also has `.answers`, a typed reference to the complete answer map. Pass it to a task when a request factory generates question names dynamically; do not create new `.answer()` references inside a runtime callback.
- Neither callback executes at definition time. Runtime input snapshots protect previous values from mutation. Task timeouts/cancellation stop downstream work and signal the callback, but cannot undo side effects or forcibly interrupt synchronous code.
- Captures show function inputs/outputs under `steps.<id>.data.input/output` redaction paths, with warnings for truncation. Only error names are exposed. Definition descriptions remain static public-safe metadata. Remote function calls are ordinary server fetches, not code serialized to another machine.
- For verification, follow actual answers into a task and a subsequent generated request; confirm the latter's criteria and trace link, then inspect redacted task data. Use the synthetic playground Functions scenario for a no-key example.
- There is no `flow.map`, `flow.repeat`, distributed worker API, or durable job store. Do not invent these APIs.

### Local experimental dynamic collections

`flow.map(id, { items, input, concurrency?: 4, maxItems }, buildItem, display?)` is available only in the experimental checkout, not npm 0.3.0. Its builder receives `item.input` shaped as `{ item, index, context }`; `context` resolves the explicit `input` option. Return a typed expression from the item builder. Use tasks for deterministic value-producing routing; terminal output/branch calls and nested maps are unsupported. Results preserve array order. An empty array makes no calls. Concurrency is 1–16 per map, maxItems is required (1–64), definitions including templates are capped at 256 nodes and execution at 1,024 expanded nodes. Exceeding bounds fails without truncation. Failures abort siblings and block queued work; no automatic task retries or partial results. Remote cancellation remains cooperative.

Choose an item in the collection card, then **View Flow** to expand its full request/function diagram directly underneath on the same canvas. Changing the selector replaces the inline item flow; **Hide Flow** collapses it. Item values use bounded/redacted capture; don't put runtime data in structural titles. For an executable sample, see `cookbooks/rag-passages/README.md` in the repository checkout. Do not promise embedding search or LLM generation in that sample: it uses fixed retrieved passages, synthetic Jev scores and a deterministic excerpt preview.

## Local experiment: returning conditionals and SDE cascade

Check the installed declarations first: `flow.if()` and `.gt()` are unreleased additions in the experimental checkout, **not npm 0.3.0**. Use `flow.if(id, { when, then, else }, display?)` for a conditional whose value feeds shared downstream steps. Each arm returns a `FlowExpression`; only the selected arm executes. The result type is the union of both values. An arm may return an earlier expression without adding a task. `output()` and terminal `branch()` arms are rejected. Scope-local refs must not leak; consume the returned conditional reference. Conditionals may nest and run inside parallel lanes or map items.

```ts
const record = flow.if("escalate", {
  when: flags.get("maxFieldProbability").gt(0.7),
  then: path => path.task("strong-extractor", {
    input: document,
    run: (text, { signal }) => strongExtractor(text, signal),
  }),
  else: () => cheapRecord,
}, { title: "Escalate a flagged field" });
// `record` is available to shared tasks/requests here; output ends the flow.
return flow.output("record", record);
```

This is a fragment inside a definition with prior `flags`, `document`, `cheapRecord` expressions and an application-owned `strongExtractor`. Do not execute application side effects while defining either arm. Runtime callbacks stay on Node; this API is not remote code execution or a durable runner. Pass provider credentials server-side and propagate the signal. Failure/cancellation blocks the merge and continuation, without executing the other arm as a fallback.

The drawer generates a Selected result merge, highlights only its selected incoming path, and captures its value with normal redaction. Generated merge IDs are not an application contract; merge nodes count toward existing limits. Use a matching server/drawer build for the new `if`/`merge` node kinds. Check both paths, a boundary and cancellation with samples before live calls.

The repository's `cookbooks/sde-cascade` provides a complete local example at `/?cookbook=sde-cascade`: cheap extraction → runtime field verification → **any per-field probability > 0.70** → stronger extractor or keep cheap → shared comparison. The overall judge is displayed but excluded from the gate. Empty fields receive only `absence_wrong`. All four cases use synthetic probabilities and local extractor fixtures; no real provider performance or original evaluation is reproduced. Do not turn on live extraction just by adding an API key.

## Local experiment: bounded loops

Check installed declarations: `flow.loop()` is unreleased and absent from npm 0.3.0. Syntax:

```ts
const final = flow.loop("repeat", {
  initial: { count: 0 }, input: { increment: 1 },
  while: state => state.get("count").lt(3), maxIterations: 3,
}, iteration => iteration.task("advance", {
  input: iteration.input,
  run: ({ state, context }) => ({ count: state.count + context.increment }),
}), { title: "Count up to three" });
return flow.output("done", final);
```

The predicate/body callbacks build once and must not perform side effects. `while` returns an expression of its own state; pass needed outer values into the initial state. It is checked before every iteration, including the first and after the last allowed body. Initially false means zero iterations. `iteration.input` provides `{ state, index, context }`, with zero-based index and context from explicit `input`. The body returns the same state type as an expression; state/context must be JSON-compatible. Use tasks to compute application predicates and `if()` for returning paths. No outer-scope references or terminal outputs inside the body.

Require `maxIterations` (1–64). If the condition is still true at the limit, `FlowLoopLimitError` rejects the run, records an incomplete loop and blocks continuation. Never present the last state as a completed classification. Preserve completed iteration details on errors/cancellation. There is no durable execution, resume or automatic task retry.

Loops may contain one level of map, plus tasks, requests, conditions and parallel lanes. Nested loops, loops in maps and nested maps remain unsupported. All template nodes count toward the 256-node definition cap; the root execution shares a 1,024-expanded-step budget across iterations and collections. A fresh per-iteration budget would bypass that guarantee. Use a matching server and drawer. Loop cards reuse inline expansion/navigation: select an iteration → View Flow → select a nested frontier item if present. Input/latest state and child outcomes use normal redaction and capture limits.

`cookbooks/hierarchical-classification` is an executable sample at `/?cookbook=hierarchical-classification`. It follows the official executable algorithm’s **separate concurrent requests per frontier node**, despite introductory prose describing batching. Preserve geometric-mean decision-edge scores, epsilon 1e-9, single-child inference bypass, completed-leaf retention and top-k pruning. Samples are a small authored taxonomy and synthetic probabilities, not a replay of official benchmark data. Verify recovery, no-request paths, an initial leaf and intentional depth exhaustion before considering live execution.
